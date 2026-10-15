import { join } from "node:path";
import { z } from "zod";
import { defineCommand } from "../lib/contracts.ts";
import { optionalFile } from "../lib/files.ts";
import { listOptions, listRows } from "../lib/output.ts";

export default defineCommand({
  description: "Summarize local command friction without logging prompts, source, or tool arguments",
  examples: ["./harness telemetry", "./harness telemetry --full"],
  options: listOptions,
  async run(context, _args, options) {
    const fields = ["command", "calls", "failures", "mean_ms"];
    listRows([], fields, fields, options);
    const text = await optionalFile(join(context.root, ".harness/state/telemetry.jsonl"));
    const schema = z.object({ type: z.string(), command: z.string().optional(), exitCode: z.number().optional(), durationMs: z.number().optional() });
    const groups = new Map<string, { command: string; calls: number; failures: number; duration: number }>();
    for (const line of (text ?? "").split("\n").filter(Boolean)) {
      const event = schema.parse(JSON.parse(line));
      if (event.type !== "command" || !event.command) continue;
      const group = groups.get(event.command) ?? { command: event.command, calls: 0, failures: 0, duration: 0 };
      group.calls++;
      group.failures += event.exitCode ? 1 : 0;
      group.duration += event.durationMs ?? 0;
      groups.set(event.command, group);
    }
    const rows = [...groups.values()].sort((a, b) => b.failures - a.failures || a.command.localeCompare(b.command))
      .map(group => ({ command: group.command, calls: group.calls, failures: group.failures, mean_ms: Math.round(group.duration / group.calls) }));
    const result = listRows(rows, fields, fields, options);
    return { data: {
      ...result,
      ...(rows.length ? { note: "Failures are investigation signals, not proof of wasted effort or poor agent performance" } : { result: "0 recorded command invocations" }),
      ...(Number(result.shown) < rows.length ? { help: ["./harness telemetry --full"] } : {})
    } };
  }
});
