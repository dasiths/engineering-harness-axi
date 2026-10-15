import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@toon-format/toon";
import { z } from "zod";
import type { TestContext } from "node:test";

export const source = dirname(dirname(fileURLToPath(import.meta.url)));

export async function fixture(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "engineering-harness-"));
  await cp(source, root, {
    recursive: true,
    filter: path => !["node_modules", ".git", "state"].includes(basename(path))
  });
  await symlink(join(source, "node_modules"), join(root, "node_modules"), "junction");
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

export function command(root: string, args: string[], options: { cwd?: string; input?: string; entry?: string } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [options.entry ?? join(root, "harness.mjs"), ...args], {
      cwd: options.cwd ?? root, timeout: 30000, maxBuffer: 4 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error);
        return;
      }
      resolve({ code: error && typeof error.code === "number" ? error.code : 0, stdout, stderr });
    });
    child.stdin?.end(options.input ?? "");
  });
}
export const data = (text: string): Record<string, unknown> => z.record(z.string(), z.unknown()).parse(decode(text));
