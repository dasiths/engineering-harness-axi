---
title: Add a Command or Sensor
description: "Extend the repository harness by adding a typed module, without registry edits."
---

## One file adds a command

Create `.harness/commands/hello.ts`:

```typescript
import { defineCommand } from "../lib/contracts.ts";

export default defineCommand({
  description: "Return a greeting",
  examples: ["./harness hello", "./harness hello --help"],
  async run() {
    return { data: { greeting: "Hello from this repository" } };
  }
});
```

It is immediately callable:

```bash
./harness hello
./harness hello --help
```

No parser registration, barrel export, build, or central command list changes.

| Module path under `.harness/commands` | Command |
|--------------------------------------|---------|
| `index.ts` | `./harness` |
| `hello.ts` | `./harness hello` |
| `api/compatibility.ts` | `./harness api compatibility` |
| `api/index.ts` | `./harness api` |

Use lowercase kebab-case names. Duplicate command paths are errors, including
`api.ts` alongside `api/index.ts`. Keep helpers and tests outside discovery
directories. Only `.ts` command/sensor modules are discovered; declaration files
are excluded. Symlinks in discovery directories are rejected.

## Arguments and options

Declare arguments and options in the same module. Commander performs parsing,
rejects unknown input, and generates help.

```typescript
import { defineCommand } from "../lib/contracts.ts";

export default defineCommand({
  description: "Describe an API target",
  arguments: [
    { name: "target", description: "API target name", required: true }
  ],
  options: [
    {
      flags: "--mode <mode>",
      description: "Inspection mode",
      choices: ["summary", "detail"],
      default: "summary"
    }
  ],
  examples: ["./harness api orders", "./harness api orders --mode detail"],
  async run(_context, args, options) {
    return { data: { target: args[0], mode: options.mode } };
  }
});
```

Command modules must not print their own output. Return `data` and, when needed,
`exitCode: 1`. Throw `HarnessError(message, help, 2)` for additional input
validation before calling dependencies. Input options remain `unknown` until
validated; do not cast arbitrary values into trusted inputs.

Commands with subprocesses must use argument arrays rather than interpolated
shell strings, set timeouts and output bounds, and translate failures into
actionable results. Never suppress a failure to make a wrapper look successful.

## One file adds a sensor

Create `.harness/sensors/readme.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defineSensor } from "../lib/contracts.ts";

export default defineSensor({
  description: "Check that the README describes setup",
  scope: "README.md",
  rules: [{
    id: "DOC001",
    expectation: "Document dependency installation",
    reason: "Agents and developers need a repeatable bootstrap",
    repair: "Document the repository's npm ci setup step",
    example: "README.md"
  }],
  async run({ root }) {
    const text = await readFile(join(root, "README.md"), "utf8");
    return {
      checked: 1,
      findings: text.includes("npm ci") ? [] : [{
        rule: "DOC001",
        location: "README.md",
        message: "Dependency installation is not documented",
        guidance: "Add the setup command and its prerequisites."
      }]
    };
  }
});
```

This intentionally small heuristic demonstrates the extension contract,
not a comprehensive documentation-quality sensor.

```bash
./harness sensors
./harness sensors explain readme
./harness sensors run readme
```

The shared runner validates observations, computes pass/fail, persists
fingerprinted reports, truncates output, records duration/outcome, and returns
the appropriate exit code. `checked: 0` is an error, not success.

Nested sensor files use slash-separated identifiers:
`api/compatibility.ts` becomes `./harness sensors run api/compatibility`.

## Capabilities are not gates

The new sensor appears automatically, but `verify` runs only names listed in
[`.harness/config.json`](../.harness/config.json).
Add a required sensor through a reviewed policy change after evaluating it
against known valid and invalid examples.

Do not let an agent weaken the policy merely to complete its task. The CLI
and its configuration are editable repository code, not a security boundary.

## Shared responsibilities

| Extension supplies | Runner supplies |
|--------------------|-----------------|
| Description, examples, arguments and options | Discovery, validation and generated help |
| Expectations, scope, repair guidance | `sensors` catalogue and `explain` |
| Observations from checking work | Pass/fail/error distinction and exit status |
| Meaningful diagnostic detail | TOON serialization, previews and full reports |
| Read-only sensor execution | Workspace fingerprint and mutation detection |

Sensors should not mutate repository inputs. If a sensor legitimately emits
temporary output, use `.harness/state`, which is excluded from fingerprints.
Do not use that exclusion to hide source or policy changes.

Helpers belong in `.harness/lib`, not beside discoverable extension modules.
Module loading is trusted code execution; review contributions before running
even `--help`. Extensions must remain side-effect-free during import.

## Wrap an existing tool instead of rebuilding it

Use [the shared process runner](../.harness/lib/process.ts):

```typescript
import { runTool, toolError } from "../lib/process.ts";

const result = await runTool({
  root,
  label: "my-check",
  executable: process.execPath,
  args: [toolScript, "--format", "json"],
  timeoutMs: 30000,
  maxBytes: 2 * 1024 * 1024,
  signal
});

if (![0, 1].includes(result.code)) {
  throw toolError("The check could not complete", result.log);
}
// Validate the tool's report, scope and exit code together before returning observations.
```

`root`, `toolScript`, and an optional `AbortSignal` come from your adapter.
The runner does not assume exit 1 means a violation: the adapter must confirm
that with a valid report. For example, ESLint's configuration failure is an
execution error, whereas a JSON report containing lint-rule violations is a
completed check with findings.

The runner returns bounded stdout/stderr and the diagnostic log directory.
Timeouts, cancellation, output overflow and failed startup throw explicit errors.
On POSIX, cancellation terminates the invocation's process group; on Windows,
it invokes `taskkill` for that process tree. Tools must not daemonize into
independent sessions. No interactive stdin is available.

Use `toolDirectory(root, label)` for fresh output under `.harness/state/tools`.
Never reuse a prior test report or build output to manufacture a pass.
Keep source and policy inputs outside this ignored directory.

See the [lint](../.harness/sensors/lint.ts), [test](../.harness/sensors/test.ts),
[build](../.harness/sensors/build.ts), and
[.NET architecture](../.harness/sensors/architecture-dotnet.ts) adapters.
Optional `prerequisites` metadata is shown by `doctor`, `sensors explain`, or
`sensors --fields name,prerequisites`. It does not install anything or change
the required-sensor policy.

## Validate and share

```bash
npm run skill:generate
npm run check
```

Add tests for valid and invalid inputs, an expected violation, no findings,
missing dependencies, and empty scope. Existing
[drop-in tests](../tests/cli.test.ts) demonstrate that extension discovery works
without registry edits.

The skill is generated from the same static guidance and extension metadata
as the CLI. CI catches stale generated content. This is an intentional review
artifact, not another hand-maintained registry.
