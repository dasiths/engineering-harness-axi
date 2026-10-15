import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineCommand } from "../../lib/contracts.ts";
import { HarnessError } from "../../lib/errors.ts";
import { listOptions, listRows } from "../../lib/output.ts";
import { presentReport } from "../../lib/sensors.ts";
import { reportSchema, fingerprint } from "../../lib/state.ts";

export default defineCommand({
  description: "Read a saved report without rerunning a sensor; mark stale evidence explicitly",
  arguments: [{ name: "id", description: "Run UUID returned by sensors run", required: true }],
  examples: ["./harness sensors report <id>", "./harness sensors report <id> --full"],
  options: listOptions,
  async run(context, args, options) {
    const parsed = z.string().uuid().safeParse(args[0]);
    if (!parsed.success) throw new HarnessError("Report ID must be a UUID", "Use the run_id from ./harness sensors run <name>", 2);
    listRows([], ["rule", "location", "message", "guidance"], ["rule", "location", "message", "guidance"], options);
    const report = reportSchema.parse(JSON.parse(await readFile(join(context.root, ".harness/state/runs", `${parsed.data}.json`), "utf8")));
    return { data: { ...presentReport(report, options), freshness: report.fingerprint === await fingerprint(context.root) ? "current" : "stale" } };
  }
});
