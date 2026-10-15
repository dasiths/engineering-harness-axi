import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defineSensor } from "../lib/contracts.ts";
import { runTool, toolDirectory, toolError } from "../lib/process.ts";
import { parseTrx } from "../lib/test-reports.ts";

export default defineSensor({
  description: "Optional .NET 10 NetArchTest example: controllers must not depend on infrastructure",
  scope: "Shop.Api.Controllers and descendants; fresh build and all Shop.ArchitectureTests",
  prerequisites: [".NET 10 SDK on PATH; NuGet access or cached locked packages"],
  rules: [{
    id: "ARCH001",
    expectation: "Controllers in Shop.Api use application-layer services instead of infrastructure",
    reason: "Keep request handling independent of persistence; enforce the structural part of the blog example",
    repair: "Move persistence access behind Shop.Application; install .NET 10 to run this optional sensor",
    example: "examples/dotnet/Shop.Application/OrdersService.cs"
  }],
  async run({ root }) {
    const cwd = join(root, "examples/dotnet");
    const directory = await toolDirectory(root, "architecture-dotnet");
    const project = "Shop.ArchitectureTests/Shop.ArchitectureTests.csproj";
    const artifacts = join(directory, "artifacts");
    const build = await runTool({
      root, cwd, label: "architecture-dotnet-build", executable: "dotnet",
      args: ["build", project, "--configuration", "Release", "--artifacts-path", artifacts,
        "--nologo", "--verbosity", "quiet", "-p:RestoreLockedMode=true", "-nodeReuse:false"],
      timeoutMs: 180000,
      missingHelp: "Install the .NET 10 SDK to run the optional architecture-dotnet sensor; default verification does not require it"
    });
    if (build.code !== 0) throw toolError("Optional .NET project could not restore or build; no architecture observation was made", build.log);
    const run = await runTool({
      root, cwd, label: "architecture-dotnet-test", executable: "dotnet",
      args: ["test", project, "--configuration", "Release", "--artifacts-path", artifacts,
        "--no-build", "--no-restore", "--logger", "trx;LogFileName=architecture.trx",
        "--results-directory", directory, "--nologo", "--verbosity", "quiet"],
      timeoutMs: 60000
    });
    let report: string;
    try {
      report = await readFile(join(directory, "architecture.trx"), "utf8");
    } catch (error) {
      throw toolError(`No fresh architecture TRX report was readable (${error instanceof Error && "code" in error ? error.code : "read failure"})`, run.log);
    }
    try {
      return parseTrx(report, run.code);
    } catch (error) {
      throw toolError(error instanceof Error ? error.message : "Invalid architecture test evidence", run.log);
    }
  }
});
