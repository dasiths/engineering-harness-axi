import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const [event, agent, suppliedCwd, suppliedSession] = process.argv.slice(2);

try {
  if (!["start", "end"].includes(event) || !["copilot", "claude-code", "codex", "opencode"].includes(agent)) {
    throw new Error("Invalid lifecycle event or agent");
  }
  let input = {};
  if (agent === "opencode") {
    input = { cwd: suppliedCwd, session_id: suppliedSession };
  } else {
    let text = "";
    for await (const chunk of process.stdin) {
      text += chunk;
      if (text.length > 65536) throw new Error("Lifecycle payload exceeds 64 KiB; no content was retained");
    }
    input = JSON.parse(text);
  }
  if (!input || typeof input !== "object" || typeof input.cwd !== "string") throw new Error("Lifecycle payload needs cwd");
  const inside = relative(await realpath(root), await realpath(input.cwd));
  if (inside === ".." || inside.startsWith("../") || inside.startsWith("..\\") || isAbsolute(inside)) {
    console.log("{}");
  } else {
    const state = join(root, ".harness/state");
    await mkdir(state, { recursive: true });
    const identifier = input.session_id ?? input.sessionId;
    const metadata = {
      time: new Date().toISOString(), type: "session", event, agent,
      ...(typeof identifier === "string" ? { session: createHash("sha256").update(identifier).digest("hex").slice(0, 16) } : {})
    };
    await appendFile(join(state, "telemetry.jsonl"), `${JSON.stringify(metadata)}\n`, { mode: 0o600 });
    if (event === "start") {
      const { stdout } = await exec(process.execPath, [join(root, "harness.mjs")], { cwd: root, timeout: 8000, maxBuffer: 262144 });
      const context = `Repository harness: run commands from ${root}. Use ./harness --help for discovery. Sensor results are evidence, not permission to weaken gates.\n${stdout}`;
      console.log(JSON.stringify(
        agent === "copilot" || agent === "opencode" ? { additionalContext: context } :
          { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }
      ));
    } else {
      console.log("{}");
    }
  }
} catch (error) {
  process.stderr.write(`Harness lifecycle error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
