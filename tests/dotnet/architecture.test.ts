import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import architectureDotnet from "../../.harness/sensors/architecture-dotnet.ts";
import { fingerprint } from "../../.harness/lib/state.ts";
import { fixture } from "../helpers.ts";

test("NetArchTest passes, catches real and nested violations, and recovers on a fresh build", { timeout: 240000 }, async t => {
  const root = await fixture(t);
  const before = await fingerprint(root);
  const passed = await architectureDotnet.run({ root });
  assert.equal(passed.checked, 3);
  assert.deepEqual(passed.findings, []);
  assert.equal(await fingerprint(root), before);
  const path = join(root, "examples/dotnet/Shop.Api/Controllers/OrdersController.cs");
  const bad = await readFile(join(root, "examples/dotnet/variants/OrdersController.bad.cs.txt"), "utf8");
  const good = await readFile(path, "utf8");
  await writeFile(path, bad);
  const failed = await architectureDotnet.run({ root });
  assert.equal(failed.findings.length, 1);
  assert.equal(failed.findings[0]?.rule, "ARCH001");
  assert.match(failed.findings[0]!.message, /Shop.Api.Controllers.OrdersController/);
  await writeFile(path, good);
  const nested = join(root, "examples/dotnet/Shop.Api/Controllers/Admin/OrdersController.cs");
  const originalNested = await readFile(nested, "utf8");
  await writeFile(nested, bad.replace("namespace Shop.Api.Controllers;", "namespace Shop.Api.Controllers.Admin;"));
  const nestedFailure = await architectureDotnet.run({ root });
  assert.match(nestedFailure.findings[0]!.message, /Shop.Api.Controllers.Admin.OrdersController/);
  await writeFile(nested, originalNested);
  assert.deepEqual((await architectureDotnet.run({ root })).findings, []);
});

test("broken .NET build is an execution error, never a passing or failing rule observation", { timeout: 90000 }, async t => {
  const root = await fixture(t);
  await writeFile(join(root, "examples/dotnet/Shop.Api/Controllers/OrdersController.cs"), "not valid C#");
  await assert.rejects(architectureDotnet.run({ root }), /could not restore or build/);
});
