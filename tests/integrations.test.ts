import assert from "node:assert/strict";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { agents, installIntegration } from "../.harness/lib/setup.ts";
import { command, fixture } from "./helpers.ts";

test("setup preserves unrelated hooks, is idempotent, and repairs relocated paths", async t => {
  const initial = await fixture(t);
  await mkdir(join(initial, ".claude"));
  await writeFile(join(initial, ".claude/settings.local.json"), JSON.stringify({
    permissions: { deny: ["Read(.env)"] },
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo user-hook" }] }] }
  }));
  for (const agent of agents) {
    assert.equal((await installIntegration(initial, agent)).changed, true);
    assert.equal((await installIntegration(initial, agent)).changed, false);
  }
  const config = JSON.parse(await readFile(join(initial, ".claude/settings.local.json"), "utf8"));
  assert.deepEqual(config.permissions, { deny: ["Read(.env)"] });
  assert.equal(config.hooks.SessionStart.length, 2);
  const cliNoop = await command(initial, ["setup", "--agent", "all"]);
  assert.equal(cliNoop.code, 0);
  assert.equal(cliNoop.stdout, "");

  const moved = `${initial} moved's copy`;
  await rename(initial, moved);
  t.after(() => rm(moved, { recursive: true, force: true }));
  for (const agent of agents) assert.equal((await installIntegration(moved, agent)).changed, true);
  assert.match(await readFile(join(moved, ".github/hooks/engineering-harness.json"), "utf8"), /moved/);
  const relocated = await command(moved, ["start", "copilot"], {
    entry: join(moved, ".harness/integrations/engineering-harness-bridge.mjs"),
    input: JSON.stringify({ cwd: join(moved, "src"), sessionId: "local-session" })
  });
  assert.equal(relocated.code, 0, relocated.stderr);
  assert.match(JSON.parse(relocated.stdout).additionalContext, /sensors_total/);
});

test("session bridges produce agent-specific context and retain only minimal lifecycle metadata", async t => {
  const root = await fixture(t);
  const entry = join(root, ".harness/integrations/engineering-harness-bridge.mjs");
  for (const agent of ["copilot", "claude-code", "codex"]) {
    const start = await command(root, ["start", agent], { entry, input: JSON.stringify({
      cwd: join(root, "src"), session_id: "private-session", initialPrompt: "DO_NOT_RECORD_THIS"
    }) });
    assert.equal(start.code, 0, start.stderr);
    const payload = JSON.parse(start.stdout);
    const context = agent === "copilot" ? payload.additionalContext : payload.hookSpecificOutput.additionalContext;
    assert.match(context, /not_run/);
    assert.match(context, /harness --help/);
    const end = await command(root, ["end", agent], { entry, input: JSON.stringify({ cwd: root, session_id: "private-session" }) });
    assert.equal(end.code, 0);
    assert.deepEqual(JSON.parse(end.stdout), {});
  }
  const log = await readFile(join(root, ".harness/state/telemetry.jsonl"), "utf8");
  assert.doesNotMatch(log, /DO_NOT_RECORD_THIS|private-session/);
  const sessionEvents = log.trim().split("\n").map(line => JSON.parse(line)).filter(event => event.type === "session");
  assert.equal(sessionEvents.length, 6);
  const outside = await command(root, ["start", "copilot"], { entry, input: JSON.stringify({ cwd: "/" }) });
  assert.deepEqual(JSON.parse(outside.stdout), {});
  const invalid = await command(root, ["start", "copilot"], { entry, input: "invalid JSON" });
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /Harness lifecycle error/);
});

test("OpenCode plugin contract injects once per session and captures deletion", async t => {
  const root = await fixture(t);
  await installIntegration(root, "opencode");
  const module = await import(pathToFileURL(join(root, ".opencode/plugins/engineering-harness.mjs")).href);
  const hooks = await module.EngineeringHarness({ directory: root });
  for (let i = 0; i < 2; i++) {
    const output = { system: [] };
    await hooks["experimental.chat.system.transform"]({ sessionID: "s1" }, output);
    assert.equal(output.system.length, 1);
    assert.match(output.system[0]!, /sensors_total/);
  }
  await hooks.event({ event: { type: "session.deleted", properties: { info: { id: "s1" } } } });
  const events = (await readFile(join(root, ".harness/state/telemetry.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(events.filter(event => event.type === "session" && event.event === "start").length, 1);
  assert.equal(events.filter(event => event.type === "session" && event.event === "end").length, 1);
});

test("unknown integration is a usage error and setup does not replace unmanaged plugin content", async t => {
  const root = await fixture(t);
  assert.equal((await command(root, ["setup", "--agent", "unknown"])).code, 2);
  await mkdir(join(root, ".opencode/plugins"), { recursive: true });
  await writeFile(join(root, ".opencode/plugins/engineering-harness.mjs"), "export const Existing = () => ({});\n");
  await assert.rejects(installIntegration(root, "opencode"), /unmanaged plugin/);
});
