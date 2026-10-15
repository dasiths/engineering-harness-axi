import { encode } from "@toon-format/toon";
import type { Data, Options } from "./contracts.ts";
import { HarnessError } from "./errors.ts";

export function print(data: Data): void {
  process.stdout.write(`${encode(data)}\n`);
}

export function listRows(rows: Data[], defaults: string[], allowed: string[], options: Options): Data {
  const requested = options.fields === undefined ? defaults : String(options.fields).split(",");
  if (!requested.length || requested.some(field => !allowed.includes(field))) {
    throw new HarnessError(`Unknown fields; choose from ${allowed.join(", ")}`, `Use --fields ${defaults.join(",")}`, 2);
  }
  const limit = options.full ? rows.length : Number(options.limit ?? 100);
  if (!Number.isSafeInteger(limit) || limit < 0) throw new HarnessError("--limit must be a non-negative integer", "Use --limit 100 or --full", 2);
  const selected = rows.slice(0, limit).map(row => Object.fromEntries(requested.map(key => [key, row[key] ?? null])));
  return { total: rows.length, shown: selected.length, items: selected };
}

export function preview(text: string, full: boolean): string {
  return !full && text.length > 1000 ? `${text.slice(0, 1000)}... (truncated, ${text.length} chars total)` : text;
}

export const listOptions = [
  { flags: "--fields <fields>", description: "Comma-separated fields to include" },
  { flags: "--limit <count>", description: "Maximum rows (default: 100)", default: "100" },
  { flags: "--full", description: "Show every row and complete text" }
];
