import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { purpose, discoveryGuidance } from "../.harness/lib/home.ts";
import { discoverCommands, discoverSensors } from "../.harness/lib/discovery.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const commands = await discoverCommands(root);
const sensors = await discoverSensors(root);
const text = `---
name: engineering-harness
description: "Use when checking repository architecture, diagnosing harness setup, running sensors, or evaluating whether code is ready for review."
---

# Repository harness

${purpose}.

This skill needs a checkout of this sample, or a repository that adopted its harness.
From that repository root, run \`npm ci\` once after approval to install dependencies.
Commands below use \`node ./harness.mjs\` rather than a global installation.
Do not download or run a similarly named package if the launcher is absent.

${discoveryGuidance.map(line => `* ${line.replaceAll("./harness", "node ./harness.mjs")}`).join("\n")}

## Available commands

${commands.filter(command => command.name).map(command => `* \`node ./harness.mjs ${command.name}\`: ${command.definition.description}`).join("\n")}

## Available sensors

${sensors.map(sensor => `* \`${sensor.name}\`: ${sensor.definition.description}`).join("\n")}

## Interpretation

Exit 0 means success, exit 1 means an unmet expectation or execution failure,
and exit 2 means invalid invocation. Inspect the structured status to distinguish
a violation from an inability to check. A previous pass may be stale.
Generated from the same guidance and module metadata used by the CLI; no live state is embedded.
`;
const path = join(root, ".agents/skills/engineering-harness/SKILL.md");
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== text) throw new Error("Generated skill is stale; run npm run skill:generate");
  console.log("Generated skill is current.");
} else {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  console.log("Generated .agents/skills/engineering-harness/SKILL.md");
}
