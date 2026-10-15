import { defineCommand } from "../lib/contracts.ts";
import { requiredSensors, runSensor } from "../lib/sensors.ts";
import { fingerprint } from "../lib/state.ts";

export default defineCommand({
  description: "Run the explicitly required sensors; a new sensor is not a gate until configured",
  examples: ["./harness verify", "./harness verify --help"],
  async run(context) {
    const reports = [];
    for (const sensor of await requiredSensors(context)) reports.push(await runSensor(context, sensor));
    const current = await fingerprint(context.root);
    const failed = reports.filter(report => report.status !== "pass" || report.fingerprint !== current);
    return { data: {
      status: failed.length ? "fail" : "pass",
      sensors: reports.map(report => ({ name: report.sensor, status: report.fingerprint === current ? report.status : "stale", findings: report.findings.length, run_id: report.id })),
      ...(failed.length ? { help: failed.map(report => `./harness sensors report ${report.id} --full`) } : { result: "All required sensors passed; human acceptance is still required" })
    }, exitCode: failed.length ? 1 : 0 };
  }
});
