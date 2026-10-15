import { z } from "zod";

export type Data = Record<string, unknown>;
export type Options = Record<string, unknown>;
export interface CommandResult {
  data: Data;
  exitCode?: 0 | 1;
  silent?: boolean;
}
export interface Context {
  root: string;
  commands: CommandEntry[];
  sensors: SensorEntry[];
}
export type CommandHandler = (context: Context, args: string[], options: Options) => Promise<CommandResult>;
export interface SensorContext {
  root: string;
}
export const findingSchema = z.object({
  rule: z.string().min(1),
  location: z.string().min(1),
  message: z.string().min(1),
  guidance: z.string().min(1)
}).strict();
export const observationSchema = z.object({
  checked: z.number().int().positive(),
  findings: z.array(findingSchema)
}).strict();
export type Observation = z.infer<typeof observationSchema>;
export type SensorHandler = (context: SensorContext) => Promise<Observation>;

const argumentSchema = z.object({
  name: z.string().regex(/^[a-z][a-z-]*$/),
  description: z.string(),
  required: z.boolean().default(true)
});
const optionSchema = z.object({
  flags: z.string(),
  description: z.string(),
  choices: z.array(z.string()).optional(),
  default: z.union([z.string(), z.boolean()]).optional()
});
export const commandSchema = z.object({
  description: z.string().min(1),
  examples: z.array(z.string()).min(1),
  arguments: z.array(argumentSchema).optional(),
  options: z.array(optionSchema).optional(),
  run: z.custom<CommandHandler>((value) => typeof value === "function", "Command must export run(context, args, options)")
}).strict();
export const sensorSchema = z.object({
  description: z.string().min(1),
  scope: z.string().min(1),
  prerequisites: z.array(z.string().min(1)).optional(),
  rules: z.array(z.object({
    id: z.string().min(1),
    expectation: z.string().min(1),
    reason: z.string().min(1),
    repair: z.string().min(1),
    example: z.string().min(1)
  })).min(1),
  run: z.custom<SensorHandler>((value) => typeof value === "function", "Sensor must export run(context)")
}).strict();
export type CommandDefinition = z.infer<typeof commandSchema>;
export type SensorDefinition = z.infer<typeof sensorSchema>;
export interface CommandEntry {
  name: string;
  definition: CommandDefinition;
}
export interface SensorEntry {
  name: string;
  definition: SensorDefinition;
}
export const defineCommand = (definition: CommandDefinition): CommandDefinition => definition;
export const defineSensor = (definition: SensorDefinition): SensorDefinition => definition;
