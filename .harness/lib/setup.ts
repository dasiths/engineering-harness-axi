import { access, mkdir } from "node:fs/promises";
import { dirname, delimiter, join, resolve } from "node:path";
import { constants } from "node:fs";
import { z } from "zod";
import { atomicWrite } from "./state.ts";
import { optionalFile } from "./files.ts";
import { HarnessError } from "./errors.ts";

export const agents = ["copilot", "claude-code", "codex", "opencode"] as const;
export type Agent = typeof agents[number];
const record = z.record(z.string(), z.unknown());
const marker = "engineering-harness-bridge.mjs";

const quote = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`;
const jsonString = (value: string): string => JSON.stringify(value);

async function nodeExecutable(): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(directory, "node");
    try {
      await access(candidate, constants.X_OK);
      const { realpath } = await import("node:fs/promises");
      if (await realpath(candidate) === await realpath(process.execPath)) return "node";
    } catch (error) {
      if (!(error instanceof Error && "code" in error && ["ENOENT", "EACCES", "ENOTDIR"].includes(String(error.code)))) throw error;
    }
  }
  return process.execPath;
}

function isManaged(value: unknown): boolean {
  const parsed = record.safeParse(value);
  if (!parsed.success) return false;
  const entry = parsed.data;
  if (typeof entry.command === "string" && entry.command.includes(marker)) return true;
  if (typeof entry.bash === "string" && entry.bash.includes(marker)) return true;
  return Array.isArray(entry.hooks) && entry.hooks.some(isManaged);
}

function mergeHooks(original: unknown, additions: Record<string, unknown[]>): Record<string, unknown> {
  const config = record.parse(original);
  const hooks = config.hooks === undefined ? {} : z.record(z.string(), z.array(z.unknown())).parse(config.hooks);
  for (const [event, values] of Object.entries(additions)) {
    hooks[event] = [...(hooks[event] ?? []).filter(entry => !isManaged(entry)), ...values];
  }
  return { ...config, hooks };
}

export async function installIntegration(root: string, agent: Agent): Promise<{ path: string; changed: boolean }> {
  if (process.platform === "win32") throw new HarnessError("Hook setup currently targets POSIX shells", "Use AGENTS.md or the generated skill on Windows; run sensors with harness.cmd");
  const executable = await nodeExecutable();
  const bridge = join(root, ".harness/integrations", marker);
  const command = (event: string) => `${quote(executable)} ${quote(bridge)} ${event} ${agent}`;
  let relative: string;
  let text: string;
  if (agent === "opencode") {
    relative = ".opencode/plugins/engineering-harness.mjs";
    const existing = await optionalFile(join(root, relative));
    if (existing && !existing.startsWith("// Managed by engineering-harness-axi.")) {
      throw new HarnessError(`Refusing to replace an unmanaged plugin: ${relative}`, "Move the conflicting plugin or choose a different integration");
    }
    text = `// Managed by engineering-harness-axi. Rerun setup after moving this repository.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const bridge = ${jsonString(bridge)};
const runtime = ${jsonString(executable)};
export const EngineeringHarness = async ({ directory }) => {
  const contexts = new Map();
  async function lifecycle(event, session) {
    const { stdout } = await exec(runtime, [bridge, event, "opencode", directory, session], { timeout: 10000, maxBuffer: 262144 });
    return JSON.parse(stdout);
  }
  return {
    "experimental.chat.system.transform": async (input, output) => {
      const session = input.sessionID ?? "unknown";
      if (!contexts.has(session)) contexts.set(session, await lifecycle("start", session));
      const context = contexts.get(session).additionalContext;
      if (context) output.system.push(context);
    },
    event: async ({ event }) => {
      if (event.type === "session.deleted") {
        const session = event.properties.info.id;
        contexts.delete(session);
        await lifecycle("end", session);
      }
    }
  };
};
`;
  } else {
    relative = agent === "copilot" ? ".github/hooks/engineering-harness.json" :
      agent === "claude-code" ? ".claude/settings.local.json" : ".codex/hooks.json";
    const existing = await optionalFile(join(root, relative));
    const original: unknown = existing ? JSON.parse(existing) : {};
    const additions: Record<string, unknown[]> = agent === "copilot" ? {
      sessionStart: [{ type: "command", bash: command("start"), timeoutSec: 10 }],
      sessionEnd: [{ type: "command", bash: command("end"), timeoutSec: 10 }]
    } : {
      SessionStart: [{ hooks: [{ type: "command", command: command("start"), timeout: 10 }] }],
      SessionEnd: [{ hooks: [{ type: "command", command: command("end"), timeout: agent === "codex" ? 3 : 10 }] }]
    };
    const merged = mergeHooks(original, additions);
    if (agent === "copilot") {
      if (merged.version !== undefined && merged.version !== 1) throw new HarnessError("Unsupported existing Copilot hook version", "Review the existing hook configuration before setup");
      merged.version = 1;
    }
    text = `${JSON.stringify(merged, null, 2)}\n`;
  }
  const path = resolve(root, relative);
  const previous = await optionalFile(path);
  if (text === previous) return { path: relative, changed: false };
  await mkdir(dirname(path), { recursive: true });
  await atomicWrite(path, text);
  return { path: relative, changed: true };
}
