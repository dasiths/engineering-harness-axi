import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { findingSchema } from "./contracts.ts";
import { optionalFile, portablePath } from "./files.ts";

export const reportSchema = z.object({
  id: z.string().uuid(),
  sensor: z.string(),
  status: z.enum(["pass", "fail", "error"]),
  scope: z.string(),
  fingerprint: z.string(),
  recordedAt: z.string(),
  durationMs: z.number(),
  checked: z.number().int().nonnegative(),
  findings: z.array(findingSchema),
  error: z.string().optional()
});
export type Report = z.infer<typeof reportSchema>;

const ignoredDirectories = new Set([".git", "node_modules", "coverage"]);
const localFiles = new Set([
  ".github/hooks/engineering-harness.json", ".claude/settings.local.json",
  ".codex/hooks.json", ".opencode/plugins/engineering-harness.mjs"
]);

export async function fingerprint(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const file = join(directory, entry.name);
      const key = portablePath(root, file);
      if (ignoredDirectories.has(entry.name) || key === ".harness/state" || localFiles.has(key)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Cannot fingerprint symbolic link: ${key}`);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        hash.update(key).update("\0").update(await readFile(file)).update("\0");
      }
    }
  }
  await visit(root);
  return hash.digest("hex");
}

export async function atomicWrite(path: string, text: string): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, text, { mode: 0o600 });
  await rename(temp, path);
}

export async function saveReport(root: string, report: Report): Promise<void> {
  const directory = join(root, ".harness/state/runs");
  await mkdir(directory, { recursive: true });
  await atomicWrite(join(directory, `${report.id}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(join(root, ".harness/state", `${encodeURIComponent(report.sensor)}.latest.json`), `${JSON.stringify(report)}\n`);
}

export async function latestReport(root: string, name: string): Promise<Report | undefined> {
  const text = await optionalFile(join(root, ".harness/state", `${encodeURIComponent(name)}.latest.json`));
  return text === undefined ? undefined : reportSchema.parse(JSON.parse(text));
}

export async function telemetry(root: string, event: Record<string, unknown>): Promise<void> {
  const directory = join(root, ".harness/state");
  await mkdir(directory, { recursive: true });
  await appendFile(join(directory, "telemetry.jsonl"), `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`, { mode: 0o600 });
}

export const repoName = (root: string): string => basename(root);
