import assert from "node:assert/strict";
import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { runTool } from "../.harness/lib/process.ts";
import { fixture } from "./helpers.ts";

test("process runner captures separate streams, preserves exit status, and never expands shell arguments", async t => {
  const root = await fixture(t);
  const argument = "$(touch should-not-exist); quoted ' argument";
  const result = await runTool({
    root, label: "fixture", executable: process.execPath,
    args: ["-e", "process.stdout.write(process.argv[1]);process.stderr.write('diagnostic');process.exitCode=7", argument]
  });
  assert.equal(result.code, 7);
  assert.equal(result.stdout, argument);
  assert.equal(result.stderr, "diagnostic");
  assert.equal(await readFile(join(root, result.log, "stderr.txt"), "utf8"), "diagnostic");
  await assert.rejects(access(join(root, "should-not-exist")), { code: "ENOENT" });
  const events = await readFile(join(root, ".harness/state/telemetry.jsonl"), "utf8");
  assert.match(events, /"type":"tool"/);
  assert.doesNotMatch(events, /quoted|diagnostic/);
});

test("missing executables, timeout, cancellation, and excessive output are errors", async t => {
  const root = await fixture(t);
  await assert.rejects(runTool({ root, label: "missing", executable: join(root, "not-installed"), args: [], missingHelp: "Install the optional tool" }), /unavailable.*Install the optional tool/);
  await assert.rejects(runTool({ root, label: "timeout", executable: process.execPath, args: ["-e", "setTimeout(()=>{},10000)"], timeoutMs: 150 }), /timed out/);
  await assert.rejects(runTool({ root, label: "large", executable: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(65536))"], maxBytes: 100 }), /exceeded/);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  try {
    await assert.rejects(runTool({ root, label: "cancel", executable: process.execPath, args: ["-e", "setTimeout(()=>{},10000)"], signal: controller.signal }), /cancelled/);
  } finally {
    clearTimeout(timer);
  }
  await assert.rejects(runTool({ root, label: "pre-cancel", executable: process.execPath, args: [], signal: AbortSignal.abort() }), /before starting/);
});

test("timed-out POSIX commands cannot leave a child writing into the repository", { skip: process.platform === "win32" }, async t => {
  const root = await fixture(t);
  const location = join(root, "child-survived.txt");
  await mkdir(join(root, ".harness/state"), { recursive: true });
  const childCode = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(location)},'alive'),1000)`;
  const parentCode = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'inherit'});setTimeout(()=>{},10000)`;
  await assert.rejects(runTool({ root, label: "tree", executable: process.execPath, args: ["-e", parentCode], timeoutMs: 300 }), /timed out/);
  await new Promise(resolve => setTimeout(resolve, 1200));
  await assert.rejects(access(location), { code: "ENOENT" });
});
