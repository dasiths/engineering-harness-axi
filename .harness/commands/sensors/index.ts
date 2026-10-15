import { defineCommand } from "../../lib/contracts.ts";
import { sensorCatalogue } from "../../lib/sensors.ts";
import { listOptions, listRows } from "../../lib/output.ts";

export default defineCommand({
  description: "List registered sensors and freshness of their last observations",
  examples: ["./harness sensors", "./harness sensors --fields name,scope,status --full"],
  options: listOptions,
  async run(context, _args, options) {
    const allowed = ["name", "description", "status", "scope", "findings", "lastRun", "prerequisites"];
    listRows([], ["name", "description", "status"], allowed, options);
    const rows = await sensorCatalogue(context);
    const list = listRows(rows, ["name", "description", "status"], allowed, options);
    return { data: {
      ...list,
      ...(rows.length ? {} : { result: "0 sensors registered; add a module under .harness/sensors" }),
      help: [
        "./harness sensors run <name>",
        "./harness sensors explain <name>",
        ...(Number(list.shown) < rows.length ? ["./harness sensors --full"] : [])
      ]
    } };
  }
});
