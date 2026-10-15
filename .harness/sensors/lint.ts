import { join } from "node:path";
import { z } from "zod";
import { defineSensor } from "../lib/contracts.ts";
import { filesIn, portablePath } from "../lib/files.ts";
import { runTool, toolError } from "../lib/process.ts";

const lintReport = z.array(z.object({
  filePath: z.string(),
  messages: z.array(z.object({
    ruleId: z.string().nullable(), severity: z.number().int().min(1).max(2),
    line: z.number().optional(), message: z.string(), fatal: z.boolean().optional()
  })),
  errorCount: z.number(), warningCount: z.number(), fatalErrorCount: z.number()
})).min(1);

export default defineSensor({
  description: "Run ESLint on application source and return rule-level findings",
  scope: "All src/**/*.ts files; warnings also require correction",
  rules: [{
    id: "LINT", expectation: "Application source satisfies the configured ESLint rules",
    reason: "Catch mechanically detectable mistakes without repeated human reminders",
    repair: "Fix the flagged source, preserving the intended lint policy",
    example: "eslint.config.mjs"
  }],
  async run({ root }) {
    const files = (await filesIn(join(root, "src"))).filter(path => path.endsWith(".ts"));
    if (!files.length) throw new Error("No application source files found for lint");
    const result = await runTool({
      root, label: "lint", executable: process.execPath,
      args: [join(root, "node_modules/eslint/bin/eslint.js"), "--format", "json", "--max-warnings", "0", ...files]
    });
    if (![0, 1].includes(result.code)) throw toolError("Lint could not complete; inspect configuration and dependencies", result.log);
    let contents: unknown;
    try {
      contents = JSON.parse(result.stdout);
    } catch {
      throw toolError("Lint did not produce JSON evidence", result.log);
    }
    const parsed = lintReport.safeParse(contents);
    if (!parsed.success) throw toolError("Lint did not produce a valid report", result.log);
    const report = parsed.data;
    if (report.length !== files.length || new Set(report.map(file => file.filePath)).size !== files.length ||
        report.some(file => !files.includes(file.filePath))) throw toolError("Lint scope does not match the requested files", result.log);
    if (report.some(file => file.fatalErrorCount > 0 || file.messages.some(message => message.fatal))) {
      throw toolError("Lint could not parse the full source scope", result.log);
    }
    const findings = report.flatMap(file => file.messages.map(message => ({
      rule: message.ruleId ?? "LINT", location: `${portablePath(root, file.filePath)}:${message.line ?? 1}`,
      message: message.message, guidance: "Repair the source and rerun ./harness sensors run lint."
    })));
    if ((result.code === 0) !== (findings.length === 0) ||
        report.some(file => file.errorCount + file.warningCount !== file.messages.length)) throw toolError("Lint result counts or exit code disagree", result.log);
    return { checked: report.length, findings };
  }
});
