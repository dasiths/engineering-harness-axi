import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { command, fixture } from "./helpers.ts";

const clients = ["copilot", "claude-code", "codex", "vscode-local"];
const passed = "status: pass\nsensors[1]{name,status}:\n  fixture,pass\n";
const failed = "status: fail\nsensors[1]{name,status}:\n  fixture,fail\n";

async function fakeVerify(root: string, output: string, exitCode: number): Promise<void> {
  await mkdir(join(root, ".harness/state"), { recursive: true });
  await writeFile(join(root, "harness.mjs"), `
import {appendFileSync} from "node:fs";
import {join} from "node:path";
if (process.argv.slice(2).join(" ") !== "verify") throw new Error("Wrong command");
appendFileSync(join(process.cwd(),".harness/state/completion-calls"),"verify\\n");
process.stdout.write(${JSON.stringify(output)});
process.exitCode=${exitCode};
`);
}

async function invoke(root: string, agent: string, retry = false, cwd = root) {
  const result = await command(root, [agent], {
    entry: join(root, ".harness/integrations/verify-on-stop.mjs"),
    input: JSON.stringify({ cwd, stop_hook_active: retry, transcript_path: "DO_NOT_RETAIN_THIS" })
  });
  assert.equal(result.code, 0, result.stderr);
  return { ...result, payload: JSON.parse(result.stdout) };
}

test("completion adapter runs fresh verification and emits the host-specific blocking protocol", async t => {
  const root = await fixture(t);
  await fakeVerify(root, failed, 1);
  for (const agent of clients) {
    const result = await invoke(root, agent);
    const decision = agent === "vscode-local" ? result.payload.hookSpecificOutput : result.payload;
    assert.equal(decision.decision, "block");
    assert.match(decision.reason, /Harness verification did not pass/);
    if (agent === "vscode-local") assert.equal(decision.hookEventName, "Stop");
    const record = JSON.parse(await readFile(join(root, ".harness/state/completion/latest.json"), "utf8"));
    assert.equal(record.verified, false);
    assert.equal(record.blocked, true);
    assert.equal(record.status, "fail");
    assert.doesNotMatch(JSON.stringify(record), /DO_NOT_RETAIN_THIS/);
  }
  assert.equal((await readFile(join(root, ".harness/state/completion-calls"), "utf8")).trim().split("\n").length, 4);
});

test("forced continuations recheck before explicit failed handoff or recovered success", async t => {
  const root = await fixture(t);
  for (const agent of clients) {
    await fakeVerify(root, failed, 1);
    const unresolved = await invoke(root, agent, true);
    assert.notEqual(unresolved.payload.decision, "block");
    assert.notEqual(unresolved.payload.hookSpecificOutput?.decision, "block");
    assert.match(unresolved.stderr, /not acceptance/);
    const record = JSON.parse(await readFile(join(root, ".harness/state/completion/latest.json"), "utf8"));
    assert.equal(record.verified, false);
    assert.equal(record.automaticRetry, true);
    assert.equal(record.blocked, false);
    await fakeVerify(root, passed, 0);
    const repaired = await invoke(root, agent, true, join(root, "src"));
    assert.deepEqual(repaired.payload, agent === "copilot" ? { decision: "allow" } : {});
    assert.equal(repaired.stderr, "");
    assert.equal(JSON.parse(await readFile(join(root, ".harness/state/completion/latest.json"), "utf8")).verified, true);
  }
  assert.equal((await readFile(join(root, ".harness/state/completion-calls"), "utf8")).trim().split("\n").length, 8);
});

test("malformed output, misleading success and missing dependencies are never verified", async t => {
  const root = await fixture(t);
  for (const [output, code] of [
    ["not a verification report", 0],
    ["status: pass\nsensors: []\n", 0],
    [failed, 0],
    [passed, 1]
  ] as const) {
    await fakeVerify(root, output, code);
    const result = await invoke(root, "copilot");
    assert.equal(result.payload.decision, "block");
    assert.equal(JSON.parse(await readFile(join(root, ".harness/state/completion/latest.json"), "utf8")).verified, false);
  }
  await rename(join(root, "node_modules"), join(root, "dependencies-hidden"));
  const missing = await invoke(root, "claude-code");
  assert.equal(missing.payload.decision, "block");
  assert.match(missing.payload.reason, /npm ci/);
});

test("out-of-scope input does not run checks; invalid input is an explicit protocol error", async t => {
  const root = await fixture(t);
  await fakeVerify(root, failed, 1);
  const outside = await invoke(root, "copilot", false, "/");
  assert.deepEqual(outside.payload, { decision: "allow" });
  await assert.rejects(readFile(join(root, ".harness/state/completion-calls")), { code: "ENOENT" });
  for (const input of ["bad json", JSON.stringify({ cwd: root }), JSON.stringify({ cwd: root, stop_hook_active: "false" })]) {
    const result = await command(root, ["vscode-local"], {
      entry: join(root, ".harness/integrations/verify-on-stop.mjs"), input
    });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.decision, "block");
    assert.match(result.stderr, /could not complete/);
  }
});

test("OpenCode mode is advisory and records failure without claiming a stop veto", async t => {
  const root = await fixture(t);
  await fakeVerify(root, failed, 1);
  const result = await invoke(root, "opencode");
  assert.equal(result.payload.verified, false);
  assert.equal(result.payload.status, "fail");
  assert.equal(result.payload.decision, undefined);
  assert.match(result.stderr, /not acceptance/);
  await fakeVerify(root, passed, 0);
  assert.equal((await invoke(root, "opencode")).payload.verified, true);
});

test("the adapter runs the real verification command for passing and violating source", async t => {
  const root = await fixture(t);
  const passing = await invoke(root, "copilot");
  assert.deepEqual(passing.payload, { decision: "allow" });
  assert.equal(JSON.parse(await readFile(join(root, ".harness/state/completion/latest.json"), "utf8")).verified, true);
  await writeFile(join(root, "src/api/orders-controller.ts"),
    await readFile(join(root, "examples/orders-controller.bad.ts"), "utf8"));
  const failing = await invoke(root, "copilot");
  assert.equal(failing.payload.decision, "block");
  assert.match(failing.payload.reason, /architecture,fail/);
  assert.equal(JSON.parse(await readFile(join(root, ".harness/state/completion/latest.json"), "utf8")).verified, false);
});

test("documented JSON hook configurations reference the adapter and matching timeouts", async () => {
  const text = await readFile(new URL("../docs/completion-hooks.md", import.meta.url), "utf8");
  const blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]!));
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].hooks.agentStop[0].timeoutSec, 120);
  assert.match(blocks[0].hooks.agentStop[0].bash, /verify-on-stop\.mjs' copilot$/);
  assert.equal(blocks[1].hooks.Stop[0].timeout, 120);
  assert.match(blocks[1].hooks.Stop[0].command, /vscode-local$/);
  for (const [index, agent] of [[2, "claude-code"], [3, "codex"]] as const) {
    assert.equal(blocks[index].hooks.Stop[0].hooks[0].timeout, 120);
    assert.ok(blocks[index].hooks.Stop[0].hooks[0].command.endsWith(agent));
  }
});
