import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import lint from "../.harness/sensors/lint.ts";
import appTests from "../.harness/sensors/test.ts";
import build from "../.harness/sensors/build.ts";
import { fingerprint } from "../.harness/lib/state.ts";
import { command, data, fixture } from "./helpers.ts";

test("lint reports real rule violations and does not modify application inputs", async t => {
  const root = await fixture(t);
  const before = await fingerprint(root);
  assert.equal((await lint.run({ root })).findings.length, 0);
  assert.equal(await fingerprint(root), before);
  await writeFile(join(root, "src/api/bad-lint.ts"), "debugger;\nexport const value = 1;\n");
  const failed = await command(root, ["sensors", "run", "lint"]);
  assert.equal(failed.code, 1);
  assert.equal(data(failed.stdout).status, "fail");
  assert.match(failed.stdout, /no-debugger/);
  await writeFile(join(root, "eslint.config.mjs"), "this is invalid JavaScript");
  const broken = await command(root, ["sensors", "run", "lint"]);
  assert.equal(broken.code, 1);
  assert.equal(data(broken.stdout).status, "error");
  assert.match(broken.stdout, /diagnostic logs/);
});

test("application-test sensor passes, fails assertions and rejects empty scope", async t => {
  const root = await fixture(t);
  const passing = await appTests.run({ root });
  assert.equal(passing.checked, 2);
  assert.equal(passing.findings.length, 0);
  await writeFile(join(root, "src/api/orders-controller.ts"), "export function getOrder(_id: string) { return {status: 500, body: {error:'broken'}}; }\n");
  const failed = await command(root, ["sensors", "run", "test"]);
  assert.equal(failed.code, 1);
  assert.equal(data(failed.stdout).status, "fail");
  assert.match(failed.stdout, /TEST/);
  await rm(join(root, "tests/application/orders-controller.test.ts"));
  await assert.rejects(appTests.run({ root }), /No application test files/);
  await writeFile(join(root, "tests/application/empty.test.ts"), "export {};\n");
  const empty = await command(root, ["sensors", "run", "test"]);
  assert.equal(empty.code, 1, empty.stdout);
  assert.equal(data(empty.stdout).status, "error");
});

test("build uses fresh outputs, preserves input fingerprints, and reports compile failures", async t => {
  const root = await fixture(t);
  const before = await fingerprint(root);
  assert.equal((await build.run({ root })).checked, 3);
  assert.equal(await fingerprint(root), before);
  await writeFile(join(root, "src/api/bad-build.ts"), "export const value: string = 42;\n");
  const failed = await command(root, ["sensors", "run", "build"]);
  assert.equal(failed.code, 1);
  assert.equal(data(failed.stdout).status, "fail");
  assert.match(failed.stdout, /TS2322/);
  const config = JSON.parse(await readFile(join(root, "tsconfig.build.json"), "utf8"));
  await rm(join(root, "src/api/bad-build.ts"));
  config.include = ["src/application/**/*.ts", "src/persistence/**/*.ts"];
  await writeFile(join(root, "tsconfig.build.json"), JSON.stringify(config));
  const missing = await command(root, ["sensors", "run", "build"]);
  assert.equal(missing.code, 1);
  assert.equal(data(missing.stdout).status, "error");
  assert.match(missing.stdout, /Expected build artifact/);
});

test("missing .NET is explicit, discoverable and not required for default verification", async t => {
  const root = await fixture(t);
  const emptyPath = join(root, ".harness/state/empty-path");
  await mkdir(emptyPath, { recursive: true });
  const env = { ...process.env, PATH: emptyPath };
  const catalogue = await command(root, ["sensors", "explain", "architecture-dotnet"], { env });
  assert.equal(catalogue.code, 0);
  assert.match(catalogue.stdout, /.NET 10 SDK/);
  const missing = await command(root, ["sensors", "run", "architecture-dotnet"], { env });
  assert.equal(missing.code, 1);
  assert.equal(data(missing.stdout).status, "error");
  assert.match(missing.stdout, /unavailable.*Install the .NET 10 SDK/);
  const verify = await command(root, ["verify"], { env });
  assert.equal(verify.code, 0, verify.stdout);
  assert.doesNotMatch(verify.stdout, /architecture-dotnet/);
});
