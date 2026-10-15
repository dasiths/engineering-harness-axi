import { Command, CommanderError, Option } from "commander";
import { randomUUID } from "node:crypto";
import { discoverCommands, discoverSensors } from "./lib/discovery.ts";
import { HarnessError } from "./lib/errors.ts";
import { print } from "./lib/output.ts";
import { telemetry } from "./lib/state.ts";
import type { Context, CommandEntry, CommandResult } from "./lib/contracts.ts";

export async function main(args: string[], root: string): Promise<void> {
  const started = performance.now();
  const invocation = randomUUID();
  let commandName = "discovery";
  let outcome = "error";
  let exitCode = 0;
  let parserMessage = "";
  try {
    const context: Context = {
      root, commands: await discoverCommands(root), sensors: await discoverSensors(root)
    };
    const program = new Command("harness").description("Repository workflows and engineering sensors").enablePositionalOptions();
    const groups = new Map<string, Command>([["", program]]);
    const results: CommandResult[] = [];
    function node(name: string): Command {
      const existing = groups.get(name);
      if (existing) return existing;
      const parts = name.split(" ");
      const leaf = parts.pop()!;
      const child = node(parts.join(" ")).command(leaf);
      groups.set(name, child);
      return child;
    }
    function register(entry: CommandEntry): void {
      const command = node(entry.name);
      command.description(entry.definition.description);
      for (const argument of entry.definition.arguments ?? []) {
        command.argument(argument.required ? `<${argument.name}>` : `[${argument.name}]`, argument.description);
      }
      for (const spec of entry.definition.options ?? []) {
        const option = new Option(spec.flags, spec.description);
        if (spec.choices) option.choices(spec.choices);
        if (spec.default !== undefined) option.default(spec.default);
        command.addOption(option);
      }
      command.addHelpText("after", `\nExamples:\n${entry.definition.examples.map(example => `  ${example}`).join("\n")}`);
      command.action(async () => {
        for (let parent = command.parent; parent; parent = parent.parent) {
          if (parent.options.some(option => parent.getOptionValueSource(option.attributeName()) === "cli")) {
            throw new HarnessError("Place options after the complete command path", `Use ./harness ${entry.name} --help for its options`, 2);
          }
        }
        commandName = entry.name || "home";
        results.push(await entry.definition.run(context, command.processedArgs, command.opts()));
      });
    }
    for (const entry of context.commands) register(entry);
    if (!context.commands.some(entry => entry.name === "")) throw new HarnessError("No home command found", "Add .harness/commands/index.ts");
    for (const command of groups.values()) {
      command.allowExcessArguments(false).showSuggestionAfterError(false).exitOverride();
      command.configureOutput({
        writeOut: text => process.stdout.write(text),
        writeErr: text => { parserMessage += text; }
      });
      command.showHelpAfterError();
    }
    await program.parseAsync(args, { from: "user" });
    for (const result of results) {
      if (!result.silent) print(result.data);
      exitCode = Math.max(exitCode, result.exitCode ?? 0);
    }
    outcome = exitCode === 0 ? "success" : "fail";
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      outcome = "help";
    } else {
      exitCode = error instanceof CommanderError ? 2 : error instanceof HarnessError ? error.exitCode : 1;
      print({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown harness error",
        help: error instanceof HarnessError ? error.help : parserMessage.trim() || "Run ./harness doctor; inspect the command or sensor module if registration fails"
      });
    }
  }
  try {
    await telemetry(root, {
      type: "command", invocation, command: commandName, outcome, exitCode,
      durationMs: Math.round(performance.now() - started)
    });
  } catch (error) {
    process.stderr.write(`Cannot persist harness telemetry: ${error instanceof Error ? error.message : String(error)}\n`);
    exitCode = 1;
  }
  process.exitCode = exitCode;
}
