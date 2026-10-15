import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export async function filesIn(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in ${directory}: ${entry.name}`);
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

export async function optionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export const portablePath = (root: string, file: string): string => relative(root, file).split("\\").join("/");
