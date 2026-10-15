import { defineCommand } from "../../lib/contracts.ts";
import { listOptions, listRows } from "../../lib/output.ts";
import { presentReport, runSensor, sensorNamed } from "../../lib/sensors.ts";

export default defineCommand({
  description: "Run one sensor, persist its evidence, and return actionable findings",
  arguments: [{ name: "name", description: "Sensor name from ./harness sensors", required: true }],
  examples: ["./harness sensors run architecture", "./harness sensors run typecheck --full"],
  options: listOptions,
  async run(context, args, options) {
    listRows([], ["rule", "location", "message", "guidance"], ["rule", "location", "message", "guidance"], options);
    const report = await runSensor(context, sensorNamed(context, args[0]));
    return { data: presentReport(report, options), exitCode: report.status === "pass" ? 0 : 1 };
  }
});
