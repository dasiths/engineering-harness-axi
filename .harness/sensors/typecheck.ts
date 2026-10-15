import ts from "typescript";
import { defineSensor } from "../lib/contracts.ts";
import { portablePath } from "../lib/files.ts";
import { loadProject } from "../lib/project.ts";

export default defineSensor({
  description: "Check the sample application's TypeScript contracts",
  scope: "Every source file in src/tsconfig.json",
  rules: [{
    id: "TYPES",
    expectation: "The application type-checks without errors",
    reason: "Invalid contracts should be repaired before architectural acceptance",
    repair: "Repair the reported source location without weakening compiler settings",
    example: "src/tsconfig.json"
  }],
  async run({ root }) {
    const program = loadProject(root);
    return {
      checked: program.getRootFileNames().length,
      findings: ts.getPreEmitDiagnostics(program).map(diagnostic => ({
        rule: `TS${diagnostic.code}`,
        location: diagnostic.file ? `${portablePath(root, diagnostic.file.fileName)}:${diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1}` : "src/tsconfig.json",
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        guidance: "Repair the type error and rerun ./harness sensors run typecheck"
      }))
    };
  }
});
