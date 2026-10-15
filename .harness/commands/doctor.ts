import { access } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "../lib/contracts.ts";
import { requiredSensors } from "../lib/sensors.ts";

export default defineCommand({
  description: "Diagnose prerequisites and registration without changing project configuration",
  examples: ["./harness doctor", "./harness doctor --help"],
  async run(context) {
    await access(join(context.root, "src/tsconfig.json"));
    const required = await requiredSensors(context);
    return { data: {
      status: "pass",
      node: process.versions.node,
      commands: context.commands.length,
      sensors: context.sensors.length,
      required: required.map(sensor => sensor.name),
      external_prerequisites: context.sensors.flatMap(sensor => (sensor.definition.prerequisites ?? []).map(requirement => ({
        sensor: sensor.name, requirement, required: required.some(entry => entry.name === sensor.name), status: "not_probed"
      }))),
      result: "Node setup and registration checked; external prerequisites and actual checks are verified when a sensor runs"
    } };
  }
});
