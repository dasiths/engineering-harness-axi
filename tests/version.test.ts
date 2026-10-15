import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { command, fixture } from "./helpers.ts";

test("version fast path works without dependencies or the command graph", async t => {
  const root = await fixture(t);
  await rename(join(root, "node_modules"), join(root, "dependencies-hidden"));
  await rename(join(root, ".harness/commands"), join(root, ".harness/commands-hidden"));
  const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
  for (const flag of ["--version", "-v", "-V"]) {
    const result = await command(root, [flag]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, `${version}\n`);
    assert.equal(result.stderr, "");
  }
  const cold = await command(root, ["doctor"]);
  assert.equal(cold.code, 1);
  assert.match(cold.stdout, /npm ci/);
});

test("version stays near the local Node process startup floor", async t => {
  const root = await fixture(t);
  const duration = (args: string[]) => {
    const start = performance.now();
    execFileSync(process.execPath, args, { cwd: root, stdio: "pipe" });
    return performance.now() - start;
  };
  const baseline: number[] = [];
  const version: number[] = [];
  for (let i = 0; i < 5; i++) {
    baseline.push(duration(["-e", "console.log(1)"]));
    version.push(duration([join(root, "harness.mjs"), "--version"]));
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[2]!;
  assert.ok(median(version) < median(baseline) * 5, "Version startup should not import the TypeScript/compiler graph");
});
