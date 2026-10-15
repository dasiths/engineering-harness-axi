import { join } from "node:path";
import ts from "typescript";

export function loadProject(root: string): ts.Program {
  const config = ts.readConfigFile(join(root, "src/tsconfig.json"), ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, join(root, "src"));
  if (parsed.errors.length) throw new Error(parsed.errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("; "));
  if (!parsed.fileNames.length) throw new Error("No source files matched src/tsconfig.json");
  return ts.createProgram(parsed.fileNames, parsed.options);
}
