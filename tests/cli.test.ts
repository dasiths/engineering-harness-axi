import assert from "node:assert/strict";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { command, data, fixture } from "./helpers.ts";

test("home is live content; doctor and help work from a nested directory", async t => {
  const root = await fixture(t);
  const result = await command(root, [], { cwd: join(root, "src/api") });
  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /not_run/);
  assert.equal(data(result.stdout).sensors_total, 2);
  assert.match(result.stdout, /bin:/);
  assert.equal((await command(root, ["doctor"])).code, 0);
  for (const args of [["--help"], ["sensors", "--help"], ["sensors", "run", "--help"]]) {
    const help = await command(root, args);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Examples:/);
  }
});

test("drop-in commands and sensors need no registry edits", async t => {
  const root = await fixture(t);
  await mkdir(join(root, ".harness/commands/demo"), { recursive: true });
  await writeFile(join(root, ".harness/commands/demo/hello.ts"), `export default {
    description: "Say hello", examples: ["./harness demo hello"],
    run: async () => ({data: {greeting: "hello"}})
  };`);
  await writeFile(join(root, ".harness/sensors/readme.ts"), `export default {
    description: "README fixture", scope: "README",
    rules: [{id:"DOC1",expectation:"Present",reason:"Discoverability",repair:"Add it",example:"README.md"}],
    run: async () => ({checked:1,findings:[]})
  };`);
  const greeting = await command(root, ["demo", "hello"]);
  assert.equal(greeting.code, 0, greeting.stdout);
  assert.equal(data(greeting.stdout).greeting, "hello");
  assert.match((await command(root, ["demo", "--help"])).stdout, /hello/);
  assert.match((await command(root, ["sensors"])).stdout, /readme/);
  assert.equal((await command(root, ["sensors", "run", "readme"])).code, 0);
  assert.match((await command(root, ["sensors", "explain", "readme"])).stdout, /DOC1/);
  const policy = JSON.parse(await readFile(join(root, ".harness/config.json"), "utf8"));
  assert.deepEqual(policy.requiredSensors, ["architecture", "typecheck"]);
});

test("unknown flags, extra arguments, bad field selection and missing arguments never run a sensor", async t => {
  const root = await fixture(t);
  for (const args of [
    ["sensors", "run", "architecture", "--typo"],
    ["sensors", "run", "architecture", "extra"],
    ["sensors", "run"],
    ["sensors", "run", "missing"],
    ["sensors", "run", "architecture", "--fields", "secret"],
    ["sensors", "run", "architecture", "--limit", "-1"],
    ["sensors", "--limit", "1", "run", "architecture"],
    ["bogus"]
  ]) {
    const result = await command(root, args);
    assert.equal(result.code, 2, result.stdout);
    assert.equal(data(result.stdout).status, "error");
    assert.ok(data(result.stdout).help);
  }
  await assert.rejects(access(join(root, ".harness/state/runs")), { code: "ENOENT" });
});

test("duplicate and invalid extension definitions fail loudly", async t => {
  const root = await fixture(t);
  await mkdir(join(root, ".harness/commands/doctor"));
  await writeFile(join(root, ".harness/commands/doctor/index.ts"), `export default {description:"Duplicate",examples:["doctor"],run:async()=>({data:{}})};`);
  const duplicate = await command(root, ["doctor"]);
  assert.equal(duplicate.code, 1);
  assert.match(duplicate.stdout, /Duplicate extension/);
  await rename(join(root, ".harness/commands/doctor/index.ts"), join(root, ".harness/commands/doctor/not-a-command.txt"));
  await writeFile(join(root, ".harness/sensors/invalid.ts"), `export default {description:"Missing handler"};`);
  const invalid = await command(root, ["sensors"]);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stdout, /Invalid sensors module/);
});

test("truncation retains full evidence and explicit counts", async t => {
  const root = await fixture(t);
  await writeFile(join(root, ".harness/sensors/large.ts"), `export default {
    description:"Large findings",scope:"fixture",
    rules:[{id:"BIG",expectation:"Test",reason:"Test",repair:"Test",example:"Test"}],
    run:async()=>({checked:2,findings:[1,2].map(n=>({rule:"BIG",location:"file:"+n,message:"a".repeat(1200),guidance:"line 1\\nline 2, with comma"}))})
  };`);
  const result = await command(root, ["sensors", "run", "large", "--limit", "1"]);
  assert.equal(result.code, 1);
  const body = data(result.stdout);
  assert.equal(body.findings_total, 2);
  assert.equal(body.findings_shown, 1);
  assert.match(result.stdout, /truncated/);
  const full = await command(root, ["sensors", "report", String(body.run_id), "--full"]);
  assert.equal(full.code, 0);
  assert.equal(data(full.stdout).findings_shown, 2);
  assert.ok(full.stdout.includes("a".repeat(1200)));
});

test("malformed observations and zero checked items are errors, never passes", async t => {
  const root = await fixture(t);
  await writeFile(join(root, ".harness/sensors/empty.ts"), `export default {
    description:"Empty",scope:"fixture",
    rules:[{id:"ZERO",expectation:"Test",reason:"Test",repair:"Test",example:"Test"}],
    run:async()=>({checked:0,findings:[]})
  };`);
  const result = await command(root, ["sensors", "run", "empty"]);
  assert.equal(result.code, 1);
  assert.equal(data(result.stdout).status, "error");
});

test("sensor input mutation invalidates the observation", async t => {
  const root = await fixture(t);
  await writeFile(join(root, ".harness/sensors/mutates.ts"), `import {writeFile} from "node:fs/promises";
    import {join} from "node:path";
    export default {
      description:"Mutation fixture",scope:"fixture",
      rules:[{id:"M",expectation:"Test",reason:"Test",repair:"Test",example:"Test"}],
      run:async({root})=>{await writeFile(join(root,"unexpected-change.txt"),"changed");return {checked:1,findings:[]};}
    };`);
  const result = await command(root, ["sensors", "run", "mutates"]);
  assert.equal(result.code, 1);
  assert.equal(data(result.stdout).status, "error");
  assert.match(result.stdout, /changed during the check/);
});

test("empty catalogue, corrupt evidence and telemetry summary are explicit", async t => {
  const root = await fixture(t);
  await rename(join(root, ".harness/sensors"), join(root, ".harness/sensors-hidden"));
  await mkdir(join(root, ".harness/sensors"));
  const empty = await command(root, ["sensors"]);
  assert.equal(empty.code, 0);
  assert.match(empty.stdout, /0 sensors registered/);
  await writeFile(join(root, ".harness/sensors/new.ts"), `export default {
    description:"Valid",scope:"fixture",
    rules:[{id:"X",expectation:"Test",reason:"Test",repair:"Test",example:"Test"}],
    run:async()=>({checked:1,findings:[]})
  };`);
  await writeFile(join(root, ".harness/state/new.latest.json"), "not JSON");
  assert.equal((await command(root, [])).code, 1);
  const summary = await command(root, ["telemetry"]);
  assert.equal(summary.code, 0);
  assert.match(summary.stdout, /failures/);
});
