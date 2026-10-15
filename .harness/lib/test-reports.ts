import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import type { Observation } from "./contracts.ts";

function xml(text: string): unknown {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Test reports must not contain DTDs or entity declarations");
  if (XMLValidator.validate(text) !== true) throw new Error("Malformed XML test report");
  return new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: "@", parseAttributeValue: false,
    parseTagValue: false, processEntities: true,
    isArray: (name, _path, _leaf, attribute) => !attribute && ["testsuite", "testcase", "failure", "error", "skipped", "UnitTestResult"].includes(name)
  }).parse(text);
}

const textValue = z.union([z.string(), z.object({ "#text": z.string().optional(), "@message": z.string().optional() })]);
const detail = (value: z.infer<typeof textValue>): string => typeof value === "string" ? value : value["@message"] ?? value["#text"] ?? "";
const count = z.string().regex(/^\d+$/).transform(Number);
const junitCase = z.object({
  "@name": z.string().min(1),
  "@file": z.string().optional(),
  "@skipped": z.string().optional(),
  failure: z.array(textValue).optional(),
  error: z.array(textValue).optional(),
  skipped: z.array(z.unknown()).optional()
}).transform(value => ({
  name: value["@name"], file: value["@file"], failure: value.failure, error: value.error,
  skipped: value.skipped ?? (value["@skipped"] !== undefined ? [value["@skipped"]] : undefined)
}));
type Suite = {
  testcase?: z.infer<typeof junitCase>[];
  testsuite?: Suite[];
};
const suite: z.ZodType<Suite> = z.lazy(() => z.object({
  testcase: z.array(junitCase).optional(),
  testsuite: z.array(suite).optional()
}));

export function parseJUnit(text: string, exitCode: number, testFiles: readonly string[] = []): Observation {
  const report = z.object({ testsuites: suite }).parse(xml(text));
  const cases: z.infer<typeof junitCase>[] = [];
  function visit(current: Suite): void {
    cases.push(...current.testcase ?? []);
    current.testsuite?.forEach(visit);
  }
  visit(report.testsuites);
  // Node's JUnit reporter records its run totals in trailing XML comments.
  const counters: Record<string, number> = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const matches = [...text.matchAll(new RegExp(`<!-- ${key} (\\d+) -->`, "g"))];
    if (matches.length !== 1) throw new Error("Node test report is incomplete: missing or duplicate run totals");
    counters[key] = Number(matches[0]![1]);
  }
  const executed = cases.filter(item => !item.skipped?.length);
  // Node 22's file-level placeholder lacks the file attribute that Node 24 emits.
  if (!executed.length || executed.some(item => item.file === item.name || testFiles.includes(item.name))) {
    throw new Error("No declared application tests executed in one or more test files");
  }
  if (counters.cancelled || cases.some(item => item.error?.length)) throw new Error("Application tests were cancelled or reported execution errors");
  const failed = executed.filter(item => item.failure?.length);
  if (counters.tests !== cases.length || counters.fail !== failed.length ||
      counters.pass !== executed.length - failed.length ||
      counters.skipped! + counters.todo! !== cases.length - executed.length) {
    throw new Error("JUnit counts do not match test results");
  }
  if ((exitCode === 0) !== (failed.length === 0) || ![0, 1].includes(exitCode)) throw new Error("Test exit code and report disagree");
  return {
    checked: executed.length,
    findings: cases.flatMap(item => {
      if (item.skipped?.length) return [{
        rule: "TEST_SKIPPED", location: item.name, message: "Application test was skipped",
        guidance: "Run the intended test instead of accepting skipped evidence."
      }];
      if (!item.failure?.length) return [];
      return [{
        rule: "TEST", location: item.name, message: item.failure.map(detail).join("\n") || "Application test failed",
        guidance: "Repair the behaviour and rerun ./harness sensors run test; do not weaken assertions to pass."
      }];
    })
  };
}

const trxResult = z.object({
  "@testName": z.string().min(1), "@outcome": z.string(),
  Output: z.object({ ErrorInfo: z.object({ Message: z.string().optional() }).optional() }).optional()
}).transform(value => ({ testName: value["@testName"], outcome: value["@outcome"], Output: value.Output }));

export function parseTrx(text: string, exitCode: number): Observation {
  const report = z.object({ TestRun: z.object({
    Results: z.object({ UnitTestResult: z.array(trxResult).min(1) }),
    ResultSummary: z.object({
      "@outcome": z.string(),
      Counters: z.object({ "@total": count, "@executed": count, "@passed": count, "@failed": count, "@error": count })
        .transform(value => ({ total: value["@total"], executed: value["@executed"], passed: value["@passed"], failed: value["@failed"], error: value["@error"] }))
    })
  }) }).parse(xml(text)).TestRun;
  const results = report.Results.UnitTestResult;
  const counts = report.ResultSummary.Counters;
  const failed = results.filter(item => item.outcome === "Failed");
  if (!counts.executed || counts.total !== results.length || counts.executed !== results.length ||
      counts.passed + counts.failed !== results.length || counts.failed !== failed.length || counts.error !== 0 ||
      results.some(item => !["Passed", "Failed"].includes(item.outcome))) {
    throw new Error("Architecture tests did not all execute or the TRX counts disagree");
  }
  if ((exitCode === 0) !== (failed.length === 0) || ![0, 1].includes(exitCode) ||
      report.ResultSummary["@outcome"] !== (failed.length ? "Failed" : "Completed")) {
    throw new Error("Architecture test exit code or summary disagrees with results");
  }
  if (!results.some(item => item.testName.endsWith("Controllers_must_not_depend_on_infrastructure"))) {
    throw new Error("Expected controller architecture rule did not execute");
  }
  if (failed.some(item => !item.testName.endsWith("Controllers_must_not_depend_on_infrastructure") ||
      !item.Output?.ErrorInfo?.Message?.includes("ARCH001:"))) {
    throw new Error("Architecture test setup or self-check failed, not a confirmed ARCH001 violation");
  }
  return {
    checked: counts.executed,
    findings: failed.map(item => ({
      rule: "ARCH001", location: item.testName, message: item.Output!.ErrorInfo!.Message!,
      guidance: "Move controller persistence access behind Shop.Application. See examples/dotnet/Shop.Application/OrdersService.cs, then rerun ./harness sensors run architecture-dotnet."
    }))
  };
}
