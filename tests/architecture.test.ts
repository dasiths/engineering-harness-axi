import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import architecture from "../.harness/sensors/architecture.ts";
import { getOrder } from "../src/api/orders-controller.ts";
import { command, data, fixture } from "./helpers.ts";

test("controller delegates to application service and preserves sample behaviour", async t => {
  const root = await fixture(t);
  assert.equal(getOrder("order-001").status, 200);
  assert.equal(getOrder("missing").status, 404);
  assert.deepEqual(await architecture.run({ root }), { checked: 1, findings: [] });
});

test("resolved persistence dependencies are detected in nested controllers, aliases, and barrel exports", async t => {
  const root = await fixture(t);
  await mkdir(join(root, "src/api/nested"));
  const path = join(root, "src/api/nested/bad.ts");
  await writeFile(path, 'import { findOrder } from "../../persistence/orders-store.js"; export const leak = findOrder("order-001");\n');
  let result = await architecture.run({ root });
  assert.equal(result.checked, 2);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.rule, "ARCH001");
  const config = JSON.parse(await readFile(join(root, "src/tsconfig.json"), "utf8"));
  config.compilerOptions.paths = { "@store/*": ["./persistence/*"] };
  await writeFile(join(root, "src/tsconfig.json"), JSON.stringify(config));
  await writeFile(path, 'import { findOrder } from "@store/orders-store.js"; export const leak = findOrder("order-001");\n');
  result = await architecture.run({ root });
  assert.equal(result.findings.length, 1);
  await mkdir(join(root, "src/shared"));
  await writeFile(join(root, "src/shared/index.ts"), 'export * from "../persistence/orders-store.js";\n');
  await writeFile(path, 'import * as store from "../../shared/index.js"; export const leak = store.findOrder("order-001");\n');
  assert.equal((await architecture.run({ root })).findings.length, 1);
  await writeFile(path, 'export * from "../../shared/index.js";\n');
  assert.equal((await architecture.run({ root })).findings.length, 1);
  await writeFile(path, 'export type Leaked = import("../../persistence/orders-store.js").Order;\n');
  assert.equal((await architecture.run({ root })).findings.length, 1);
  await writeFile(path, 'export const leaked = import("../../persistence/orders-store.js");\n');
  assert.equal((await architecture.run({ root })).findings.length, 1);
});

test("unresolved imports and empty controller scope are explicit errors", async t => {
  const root = await fixture(t);
  await writeFile(join(root, "src/api/orders-controller.ts"), 'import "./missing.js";\nexport const value = 1;\n');
  // Side-effect resolution must be checked even when TypeScript permits it.
  await assert.rejects(architecture.run({ root }), /Cannot resolve|does not type-check/);
  await rm(join(root, "src/api/orders-controller.ts"));
  await assert.rejects(architecture.run({ root }), /No API modules/);
});

test("a failing architecture result has repair guidance and stale evidence never stays green", async t => {
  const root = await fixture(t);
  const first = await command(root, ["sensors", "run", "architecture"]);
  assert.equal(first.code, 0);
  await writeFile(join(root, "src/api/orders-controller.ts"), 'import { findOrder } from "../persistence/orders-store.js"; export const getOrder = findOrder;\n');
  const stale = await command(root, []);
  assert.match(stale.stdout, /stale/);
  const failure = await command(root, ["sensors", "run", "architecture"]);
  assert.equal(failure.code, 1);
  assert.equal(data(failure.stdout).status, "fail");
  assert.match(failure.stdout, /ARCH001/);
  assert.match(failure.stdout, /application-layer/);
  const gate = await command(root, ["verify"]);
  assert.equal(gate.code, 1);
  assert.equal(data(gate.stdout).status, "fail");
});

test("the supplied bad and repaired examples demonstrate failure then recovery", async t => {
  const root = await fixture(t);
  const bad = await readFile(join(root, "examples/orders-controller.bad.ts"), "utf8");
  const good = await readFile(join(root, "examples/orders-controller.good.ts"), "utf8");
  await writeFile(join(root, "src/api/orders-controller.ts"), bad);
  assert.equal((await command(root, ["sensors", "run", "typecheck"])).code, 0);
  assert.equal((await command(root, ["sensors", "run", "architecture"])).code, 1);
  await writeFile(join(root, "src/api/orders-controller.ts"), good);
  assert.equal((await command(root, ["verify"])).code, 0);
});
