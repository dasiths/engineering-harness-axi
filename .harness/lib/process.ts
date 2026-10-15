import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessError } from "./errors.ts";
import { portablePath } from "./files.ts";
import { telemetry } from "./state.ts";

export interface ToolResult {
  code: number;
  stdout: string;
  stderr: string;
  log: string;
}
export interface ToolOptions {
  root: string;
  label: string;
  executable: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  missingHelp?: string;
}

export async function toolDirectory(root: string, label: string): Promise<string> {
  const parent = join(root, ".harness/state/tools");
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, `${label.replace(/[^a-z0-9-]/gi, "-")}-`));
}

export function toolError(message: string, log: string): HarnessError {
  return new HarnessError(`${message}; diagnostic logs: ${log}`, `Inspect ${log}, repair the setup, and rerun the sensor`);
}

export async function runTool(options: ToolOptions): Promise<ToolResult> {
  const timeout = options.timeoutMs ?? 30000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("Tool time and output bounds must be positive integers");
  }
  if (options.signal?.aborted) throw new HarnessError("Tool execution was cancelled before starting", "Rerun the sensor when ready");
  const directory = await toolDirectory(options.root, options.label);
  const log = portablePath(options.root, directory);
  const started = performance.now();
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let bytes = 0;
  let failure: string | undefined;
  let missing = false;
  const environment: NodeJS.ProcessEnv = {
    ...process.env, CI: "true", NO_COLOR: "1", TERM: "dumb",
    DOTNET_NOLOGO: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1", MSBUILDDISABLENODEREUSE: "1"
  };
  // Wrapped application tests must not inherit the harness test worker's mode.
  delete environment.NODE_TEST_CONTEXT;
  const code = await new Promise<number>(resolve => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd ?? options.root,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: environment
    });
    const terminate = (reason: string): void => {
      if (failure) return;
      failure = reason;
      if (!child.pid) return;
      if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
        killer.on("error", error => {
          process.stderr.write(`Cannot terminate tool tree: ${error.message}\n`);
          child.kill("SIGKILL");
        });
      } else {
        try {
          // Only the process group created for this invocation is terminated.
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
            process.stderr.write(`Cannot terminate tool group: ${String(error)}\n`);
            child.kill("SIGKILL");
          }
        }
      }
    };
    const collect = (chunks: Buffer[], chunk: Buffer): void => {
      const remaining = Math.max(0, maxBytes - bytes);
      chunks.push(chunk.subarray(0, remaining));
      bytes += chunk.length;
      if (bytes > maxBytes) terminate("Tool output exceeded its bound; incomplete evidence was rejected");
    };
    child.stdout.on("data", chunk => collect(stdout, chunk));
    child.stderr.on("data", chunk => collect(stderr, chunk));
    const cancel = () => terminate("Tool execution was cancelled");
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => terminate(`Tool timed out after ${timeout} ms`), timeout);
    child.on("error", error => {
      missing = "code" in error && error.code === "ENOENT";
      failure = missing ? "Required executable is unavailable" : "Could not start tool";
    });
    child.on("close", (exit, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      if (signal && !failure) failure = `Tool terminated by signal ${signal}`;
      resolve(exit ?? -1);
    });
    if (options.signal?.aborted) cancel();
  });
  const result = { code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), log };
  await Promise.all([
    writeFile(join(directory, "stdout.txt"), result.stdout, { mode: 0o600 }),
    writeFile(join(directory, "stderr.txt"), result.stderr, { mode: 0o600 })
  ]);
  await telemetry(options.root, { type: "tool", tool: options.label, exitCode: code, outcome: failure ? "error" : code === 0 ? "success" : "nonzero", durationMs: Math.round(performance.now() - started), log });
  if (failure) throw toolError(`${failure}${missing && options.missingHelp ? `. ${options.missingHelp}` : ""}`, log);
  return result;
}
