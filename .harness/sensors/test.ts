import { join } from "node:path";
import { defineSensor } from "../lib/contracts.ts";
import { filesIn } from "../lib/files.ts";
import { runTool, toolError } from "../lib/process.ts";
import { parseJUnit } from "../lib/test-reports.ts";

export default defineSensor({
  description: "Run application tests, not the harness's own test suite",
  scope: "tests/application/**/*.test.ts; no skipped tests accepted",
  rules: [{
    id: "TEST", expectation: "Application tests execute and their assertions pass",
    reason: "Verify observable behaviour before asking a person to accept a change",
    repair: "Repair the behaviour; do not weaken assertions or skip failing tests",
    example: "tests/application/orders-controller.test.ts"
  }],
  async run({ root }) {
    const files = (await filesIn(join(root, "tests/application"))).filter(path => path.endsWith(".test.ts"));
    if (!files.length) throw new Error("No application test files were discovered");
    const result = await runTool({
      root, label: "test", executable: process.execPath,
      args: ["--import", "tsx", "--test", "--test-reporter", "junit", ...files]
    });
    try {
      return parseJUnit(result.stdout, result.code, files);
    } catch (error) {
      throw toolError(error instanceof Error ? error.message : "Invalid application test evidence", result.log);
    }
  }
});
