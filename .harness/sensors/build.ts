import { join, relative } from "node:path";
import { stat } from "node:fs/promises";
import { defineSensor } from "../lib/contracts.ts";
import { loadProject } from "../lib/project.ts";
import { runTool, toolDirectory, toolError } from "../lib/process.ts";

export default defineSensor({
  description: "Compile the application into fresh JavaScript and declaration artifacts",
  scope: "tsconfig.build.json; emits only into ignored .harness/state",
  rules: [{
    id: "BUILD", expectation: "All application source files produce JavaScript and declarations",
    reason: "A no-emit type check is not proof that build artifacts were produced",
    repair: "Fix compilation diagnostics without weakening the compiler configuration",
    example: "tsconfig.build.json"
  }],
  async run({ root }) {
    const sources = loadProject(root).getRootFileNames().filter(path => !path.endsWith(".d.ts"));
    if (!sources.length) throw new Error("No application inputs were discovered for build");
    const directory = await toolDirectory(root, "build-artifacts");
    const result = await runTool({
      root, label: "build", executable: process.execPath,
      args: [join(root, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.build.json",
        "--outDir", directory, "--noEmit", "false", "--noEmitOnError", "--declaration", "--incremental", "false", "--pretty", "false", "--listEmittedFiles"]
    });
    if (result.code !== 0) {
      const diagnostics = result.stdout.split(/\r?\n/).filter(line => /error TS\d+:/.test(line));
      if (![1, 2].includes(result.code) || !diagnostics.length) throw toolError("Build could not execute or produced no compiler diagnostics", result.log);
      return { checked: sources.length, findings: diagnostics.map(message => ({
        rule: "BUILD", location: "tsconfig.build.json", message,
        guidance: "Repair the compiler diagnostic and rerun ./harness sensors run build."
      })) };
    }
    for (const source of sources) {
      const name = relative(join(root, "src"), source).replace(/\.ts$/, "");
      if (name.startsWith("..")) throw toolError("Build source is outside the declared application scope", result.log);
      for (const extension of [".js", ".d.ts"]) {
        const artifact = join(directory, name + extension);
        try {
          const info = await stat(artifact);
          if (!info.isFile() || info.size === 0 || !result.stdout.includes(artifact.split("\\").join("/"))) throw new Error("Artifact was not emitted");
        } catch {
          throw toolError(`Expected build artifact is missing or empty: ${name}${extension}`, result.log);
        }
      }
    }
    return { checked: sources.length, findings: [] };
  }
});
