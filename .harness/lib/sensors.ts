import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { observationSchema, type Context, type Options, type SensorEntry, type Data } from "./contracts.ts";
import { HarnessError } from "./errors.ts";
import { listRows, preview } from "./output.ts";
import { fingerprint, latestReport, saveReport, telemetry, type Report } from "./state.ts";

export function sensorNamed(context: Context, name: string | undefined): SensorEntry {
  const sensor = context.sensors.find(entry => entry.name === name);
  if (!sensor) throw new HarnessError(`Unknown sensor: ${name ?? "(missing)"}`, `Available sensors: ${context.sensors.map(entry => entry.name).join(", ") || "none; add a module to .harness/sensors"}`, 2);
  return sensor;
}

export async function sensorCatalogue(context: Context): Promise<Data[]> {
  const current = await fingerprint(context.root);
  return Promise.all(context.sensors.map(async sensor => {
    const last = await latestReport(context.root, sensor.name);
    const status = last ? last.fingerprint === current ? last.status : "stale" : "not_run";
    return {
      name: sensor.name, description: sensor.definition.description, status,
      scope: sensor.definition.scope,
      findings: last && status !== "stale" ? last.findings.length : null,
      lastRun: last?.recordedAt ?? null
    };
  }));
}

export async function runSensor(context: Context, sensor: SensorEntry): Promise<Report> {
  const start = performance.now();
  const before = await fingerprint(context.root);
  const report: Report = {
    id: randomUUID(), sensor: sensor.name, status: "error", scope: sensor.definition.scope,
    fingerprint: before, recordedAt: new Date().toISOString(), durationMs: 0, checked: 0, findings: []
  };
  try {
    const observation = observationSchema.parse(await sensor.definition.run({ root: context.root }));
    report.checked = observation.checked;
    report.findings = observation.findings;
    const after = await fingerprint(context.root);
    if (before !== after) throw new Error("Repository changed during the check; rerun it on a stable workspace");
    report.status = report.findings.length ? "fail" : "pass";
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Sensor threw a non-Error value";
    report.status = "error";
  }
  report.durationMs = Math.round(performance.now() - start);
  await saveReport(context.root, report);
  await telemetry(context.root, { type: "sensor", sensor: sensor.name, runId: report.id, status: report.status, durationMs: report.durationMs, findings: report.findings.length, fingerprint: before });
  return report;
}

export function presentReport(report: Report, options: Options): Data {
  const findings = report.findings.map(finding => ({
    ...finding,
    message: preview(finding.message, Boolean(options.full)),
    guidance: preview(finding.guidance, Boolean(options.full))
  }));
  const list = listRows(findings, ["rule", "location", "message", "guidance"], ["rule", "location", "message", "guidance"], options);
  const truncated = Number(list.shown) < report.findings.length || (!options.full && report.findings.some(f => f.message.length > 1000 || f.guidance.length > 1000));
  return {
    status: report.status, sensor: report.sensor, run_id: report.id, scope: report.scope,
    checked: report.checked, findings_total: report.findings.length, findings_shown: list.shown,
    findings: list.items,
    ...(report.error ? { error: report.error } : {}),
    ...(report.status === "pass" ? { result: `0 violations across ${report.checked} checked items` } : {}),
    ...(report.status !== "pass" || truncated ? { help: [
      ...(report.status === "fail" ? [`./harness sensors explain ${report.sensor}`] : []),
      ...(report.status === "error" ? ["./harness doctor"] : []),
      ...(truncated ? [`./harness sensors report ${report.id} --full`] : [])
    ] } : {})
  };
}

export async function requiredSensors(context: Context): Promise<SensorEntry[]> {
  const schema = z.object({ requiredSensors: z.array(z.string()).min(1) }).strict();
  const config = schema.parse(JSON.parse(await readFile(join(context.root, ".harness/config.json"), "utf8")));
  if (new Set(config.requiredSensors).size !== config.requiredSensors.length) {
    throw new HarnessError("Duplicate required sensors", "Review .harness/config.json");
  }
  return config.requiredSensors.map(name => sensorNamed(context, name));
}
