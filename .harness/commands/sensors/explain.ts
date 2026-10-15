import { defineCommand } from "../../lib/contracts.ts";
import { preview } from "../../lib/output.ts";
import { sensorNamed } from "../../lib/sensors.ts";

export default defineCommand({
  description: "Explain a sensor's expectations and repair guidance without running it",
  arguments: [{ name: "name", description: "Sensor name", required: true }],
  examples: ["./harness sensors explain architecture", "./harness sensors explain architecture --full"],
  options: [{ flags: "--full", description: "Show untruncated rule guidance" }],
  async run(context, args, options) {
    const sensor = sensorNamed(context, args[0]);
    const rules = sensor.definition.rules.map(rule => Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, preview(value, Boolean(options.full))])));
    const truncated = !options.full && sensor.definition.rules.some(rule => Object.values(rule).some(value => value.length > 1000));
    return { data: {
      sensor: sensor.name, description: sensor.definition.description, scope: sensor.definition.scope, rules,
      prerequisites: sensor.definition.prerequisites ?? [],
      ...(truncated ? { help: [`./harness sensors explain ${sensor.name} --full`] } : {})
    } };
  }
});
