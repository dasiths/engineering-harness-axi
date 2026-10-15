import assert from "node:assert/strict";
import test from "node:test";
import { parseJUnit, parseTrx } from "../.harness/lib/test-reports.ts";

function junit(cases: string, totals: { tests?: number; pass?: number; fail?: number; cancelled?: number; skipped?: number; todo?: number } = {}): string {
  const counts = { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0, ...totals };
  return `<testsuites>${cases}${Object.entries(counts).map(([key, value]) => `<!-- ${key} ${value} -->`).join("")}</testsuites>`;
}

function trx(options: { outcome?: string; message?: string; total?: number; executed?: number; name?: string } = {}): string {
  const outcome = options.outcome ?? "Passed";
  const failed = Number(outcome === "Failed");
  return `<TestRun xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
    <Results><UnitTestResult testName="${options.name ?? "Controllers_must_not_depend_on_infrastructure"}" outcome="${outcome}">
      <Output><ErrorInfo><Message>${options.message ?? ""}</Message></ErrorInfo></Output>
    </UnitTestResult></Results>
    <ResultSummary outcome="${failed ? "Failed" : "Completed"}">
      <Counters total="${options.total ?? 1}" executed="${options.executed ?? 1}" passed="${failed ? 0 : 1}" failed="${failed}" error="0"/>
    </ResultSummary></TestRun>`;
}

test("Node JUnit interprets assertions, escaped details, nested suites, and skips", () => {
  assert.deepEqual(parseJUnit(junit('<testcase name="a"/>'), 0), { checked: 1, findings: [] });
  const failed = parseJUnit(junit('<testcase name="a" failure="attribute must not overwrite the child"><failure message="expected &lt; value">Expected &amp; actual</failure></testcase>', { pass: 0, fail: 1 }), 1);
  assert.equal(failed.findings[0]?.message, "expected < value");
  assert.equal(parseJUnit(junit('<testsuite><testcase name="a"/></testsuite>'), 0).checked, 1);
  const skipped = parseJUnit(junit('<testcase name="a"/><testcase name="b"><skipped/></testcase>', { tests: 2, skipped: 1 }), 0);
  assert.equal(skipped.findings[0]?.rule, "TEST_SKIPPED");
});

test("JUnit rejects no tests, incomplete/duplicate totals, exit mismatch, cancellations and unsafe XML", () => {
  assert.throws(() => parseJUnit(junit('<testcase name="/repo/tests/empty.test.ts"/>'), 0, ["/repo/tests/empty.test.ts"]), /No declared/);
  assert.throws(() => parseJUnit(junit('<testcase name="/repo/tests/empty.test.ts" file="/repo/tests/empty.test.ts"/>'), 0), /No declared/);
  for (const [text, code] of [
    [junit("", { tests: 0, pass: 0 }), 0],
    ["<testsuites><testcase name=\"a\"/></testsuites>", 0],
    [junit('<testcase name="a"/>').replace("</testsuites>", "<!-- tests 1 --></testsuites>"), 0],
    [junit('<testcase name="a"/>', { tests: 2 }), 0],
    [junit('<testcase name="a"/>'), 1],
    [junit('<testcase name="a"/>', { cancelled: 1 }), 1],
    ["not xml", 0],
    ["<!DOCTYPE x [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><testsuites/>", 0]
  ] as const) assert.throws(() => parseJUnit(text, code));
});

test("TRX distinguishes a real rule violation from setup failure and missing scope", () => {
  assert.deepEqual(parseTrx(trx(), 0), { checked: 1, findings: [] });
  const failure = parseTrx(trx({ outcome: "Failed", message: "ARCH001: Offenders: OrdersController" }), 1);
  assert.equal(failure.findings[0]?.rule, "ARCH001");
  assert.match(failure.findings[0]!.message, /OrdersController/);
  for (const [text, code] of [
    [trx(), 1],
    [trx({ total: 0, executed: 0 }), 0],
    [trx({ name: "Unrelated_test" }), 0],
    [trx({ outcome: "NotExecuted" }), 0],
    [trx({ outcome: "Failed", message: "Empty type selection" }), 1],
    [trx({ outcome: "Failed", message: "ARCH001: broken self-test", name: "Rule_self_check" }), 1],
    ["<TestRun/>", 0]
  ] as const) assert.throws(() => parseTrx(text, code));
});
