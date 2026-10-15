---
title: Engineering Harness AXI
description: "Build an extensible repository CLI on top of your coding agent's harness."
---

## Turn recurring friction into shared team assets

A coding agent already has a harness: tools, permissions, context, and an
execution loop. This sample adds a small, repository-owned interface to your
team's engineering expectations. It does not replace GitHub Copilot or another
agent, and does not require an API key.

```text
Agent / developer / CI
        |
     ./harness
        |
  Discovered commands ---- Discovered sensors
        |                        |
  Repository workflows    Architecture / type checks
        |                        |
   TOON output + next actions + local evidence + telemetry
```

The main feature is extensibility:

* Add one module under [`.harness/commands/`](.harness/commands) to introduce a command.
* Add one module under [`.harness/sensors/`](.harness/sensors) to introduce a sensor.
* Discovery, help, output, and execution use those modules. No central registry edits.
* A discovered sensor is not automatically mandatory. Review changes to
  [the acceptance policy](.harness/config.json) separately.

Inspired by [AXI](https://axi.md/) and its
[ten agent-facing CLI principles](docs/axi.md). This is an educational sample,
not an independently certified integration or a hardened policy boundary.

## Start in two minutes

Use Node.js 22.12 or later; Node.js 24 is recommended. Clone a trusted copy
and review it before running repository code.

```bash
git clone https://github.com/dasiths/engineering-harness-axi.git
cd engineering-harness-axi
npm ci

./harness doctor
./harness
./harness sensors
./harness sensors run architecture
./harness verify
```

There is no global install, build step, or automatic package download on each
invocation. The launcher uses the pinned local TypeScript runner.

On Windows, use `node ./harness.mjs` or `harness.cmd` in place of `./harness`.
The CLI is portable; the optional lifecycle-hook installer currently targets
POSIX shells. Run setup only on Linux/macOS/WSL.

Run `./harness` from the repository root. From a subdirectory, invoke the launcher
by its root-relative or absolute path. Once launched, it resolves project paths
from its own repository, not the caller's current directory.

## Command surface

| Invocation | Purpose |
|------------|---------|
| `./harness` | Current evidence, freshness, and relevant next actions |
| `./harness --help` | Command discovery and usage |
| `./harness doctor` | Diagnose prerequisites and extension registration |
| `./harness sensors` | Discover sensors without executing them |
| `./harness sensors run architecture` | Run one sensor |
| `./harness sensors explain architecture` | Expectations, scope, and repair guidance |
| `./harness sensors report <id> --full` | Retrieve saved evidence without rerunning |
| `./harness verify` | Run the explicitly required sensors |
| `./harness telemetry` | Summarize local command failures and duration |
| `./harness setup --agent copilot` | Opt in to project-local Copilot lifecycle hooks |
| `./harness --version` | Bare version without loading extensions |

Every command supports `--help`. List commands support `--fields`, `--limit`,
and `--full` where shown in their help. Put options after the complete command
path, for example `./harness sensors run architecture --full`.

No-argument execution is a live dashboard, not a full build or a usage manual.
Unknown, stale, failed, and successful evidence are distinct states.
The CLI's normal data and errors use [TOON](https://toonformat.dev/) on stdout.
Help is concise text; version flags print only the version.

## Try the architecture-fitness scenario

The sample API consists of controller-style functions, not a running web server:

```text
src/api/orders-controller.ts
        |
src/application/orders-service.ts
        |
src/persistence/orders-store.ts
```

Our team's illustrative rule: controllers use application-layer services
instead of accessing persistence directly. The reason is to keep request
handling testable without persistence setup. This is a local design decision,
not a universal layering rule.

The repository starts in a passing state. Introduce the known violation:

```bash
cp examples/orders-controller.bad.ts src/api/orders-controller.ts
./harness sensors run architecture
```

The check exits `1` and reports `ARCH001`, the offending location, its
dependency, and guidance pointing at the application service. Type checking
alone still passes: structurally valid code can violate a team expectation.

```bash
./harness sensors explain architecture
./harness
```

Repair it yourself, or restore the supplied passing version:

```bash
cp examples/orders-controller.good.ts src/api/orders-controller.ts
./harness verify
```

The architecture sensor uses the TypeScript compiler's module and symbol
resolution, including path aliases, nested API folders, and named/namespace
imports through barrel re-exports. It checks direct module dependencies;
it is not whole-program data-flow analysis or a semantic judge of whether
a responsibility belongs in the right layer. Computed module loading and
unresolved/type-invalid source produce an error rather than a green result.

## Add your own commands and sensors

Follow [the extension guide](docs/extending.md) for copyable examples.

A sensor returns observations, not formatted console text. The runner creates
the report, exit code, truncation, and telemetry. A command returns structured
data, not its own parser or CLI framework.

Extensions are trusted repository code. They run with the caller's permissions.
They must not perform work during import, print raw tool output, or make network
calls merely to populate help.

## Use with GitHub Copilot

[AGENTS.md](AGENTS.md) tells agents how to discover commands and use sensors.
It is deliberately small. It is named `AGENTS.md`, not `agent.md`, so supported
agent clients can discover it automatically.

Instructions guide behaviour; they do not enforce it. To provide live startup
context in Copilot CLI, explicitly opt in:

```bash
./harness setup --agent copilot
```

Review the generated local hooks, trust them in the client, and start a new
session. No hooks are installed by `npm ci`, `doctor`, or ordinary commands.
Setup also supports `claude-code`, `codex`, `opencode`, and `all`.

Alternatively, use the generated
[on-demand skill](.agents/skills/engineering-harness/SKILL.md). It describes
the same command surface without injecting live state on every session.
You do not need both integrations.

See [agent integration details](docs/integrations.md) for client differences,
privacy boundaries, and what was tested.

## Sensors, gates, and backpressure

* A sensor detects unmet expectations and reports scoped evidence.
* A gate decides whether work can proceed based on that evidence.
* Backpressure comes from requiring the work to satisfy those expectations.

The [CI workflow](.github/workflows/verify.yml) runs the same `verify` command.
After its first run, configure the GitHub check `verify (24)` as required in
your repository's ruleset if you want a merge gate. A workflow alone does not
prevent merges. Protect changes to the harness, policy, and workflow through
appropriate code-owner review.

`verify` runs fresh checks rather than trusting saved reports. All required
results must refer to the same current workspace fingerprint. A skipped,
failed, stale, empty-scope, or broken check cannot authorize acceptance.

| Exit code | Interpretation |
|-----------|----------------|
| `0` | The requested operation succeeded, including a setup no-op |
| `1` | A check found violations, or an operation could not complete |
| `2` | Invalid arguments, flags, or an unknown sensor |

Read `status` to distinguish `fail` from `error`. Reading a historical failing
report can itself succeed with exit `0`; it does not rerun or approve the check.

## Observe friction, then improve the asset

Ignored local state lives under `.harness/state/`:

* Immutable run reports and latest evidence, fingerprinted against repository files
* JSONL events for command duration/outcome and sensor observations
* Minimal session-start/end metadata when an integration is enabled

```bash
./harness telemetry
```

Telemetry failures are investigation signals. A useful failing test is not
necessarily waste. Look for repeated setup confusion, ineffective repairs,
or duplicated discovery before changing a command or instruction.

Nothing is uploaded. Prompts, transcripts, source contents, tool arguments,
and account names are not recorded in telemetry. Finding reports contain
repository-relative locations and diagnostic messages. Review them before sharing.
This sample uses local JSONL, not an OpenTelemetry exporter; connect it to
your organisation's collector only after deciding retention and redaction policy.

## Develop and validate

```bash
npm run typecheck
npm test
npm run skill:generate
npm run skill:check
./harness verify
```

`npm run check` runs the complete sequence except generation: stale committed
skill content fails CI.

The tests exercise real CLI subprocesses, extension discovery, rule violations,
staleness, malformed output, truncation, version startup, and integration
configuration/bridge contracts. Agent integrations are not end-to-end certified
against live client sessions.

## License and attribution

[MIT](LICENSE). AXI design principles are credited to
[Kuncheng and the AXI project](https://github.com/kunchenguid/axi).
The architecture scenario and harness implementation here are original sample
code. No third-party benchmark results are claimed for this implementation.
