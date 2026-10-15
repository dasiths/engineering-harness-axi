import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { commandSchema, sensorSchema, type CommandEntry, type SensorEntry } from "./contracts.ts";
import { filesIn } from "./files.ts";
import { HarnessError } from "./errors.ts";

async function discover<T>(root: string, folder: string, schema: z.ZodType<T>, commands: boolean): Promise<{ name: string; definition: T }[]> {
  const directory = join(root, ".harness", folder);
  const entries = [];
  const names = new Set<string>();
  for (const file of await filesIn(directory)) {
    if (!file.endsWith(".ts") || file.endsWith(".d.ts")) continue;
    const parts = relative(directory, file).split(/[\\/]/);
    const leaf = parts.pop()!.slice(0, -3);
    if (leaf !== "index" || !commands) parts.push(leaf);
    if (parts.some(part => !/^[a-z][a-z0-9-]*$/.test(part))) {
      throw new HarnessError(`Invalid extension path: ${relative(root, file)}`, "Use lowercase kebab-case file and folder names");
    }
    const name = parts.join(commands ? " " : "/");
    if (names.has(name)) throw new HarnessError(`Duplicate extension: ${name}`, "Keep one module for each command or sensor path");
    names.add(name);
    const module = await import(pathToFileURL(file).href);
    const result = schema.safeParse(module.default);
    if (!result.success) {
      throw new HarnessError(`Invalid ${folder} module: ${relative(root, file)}`, result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    }
    entries.push({ name, definition: result.data });
  }
  return entries;
}
export const discoverCommands = (root: string): Promise<CommandEntry[]> => discover(root, "commands", commandSchema, true);
export const discoverSensors = (root: string): Promise<SensorEntry[]> => discover(root, "sensors", sensorSchema, false);
