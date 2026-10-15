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

Use Node.js 22.13+ or 24+; Node.js 24 is recommended. Clone a trusted copy
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

## Included sensors

| Sensor | Tool or evidence | Required by default |
|--------|------------------|---------------------|
| `architecture` | Resolved TypeScript dependencies | Yes |
| `typecheck` | TypeScript compiler diagnostics, without emitting | Yes |
| `lint` | ESLint JSON report for application source | Yes |
| `test` | Node application tests and a validated JUnit report | Yes |
| `build` | Fresh JavaScript and declaration artifacts from TypeScript | Yes |
| `architecture-dotnet` | Fresh .NET build, NetArchTest, and a validated TRX report | No |

```bash
./harness sensors run lint
./harness sensors run test
./harness sensors run build
./harness sensors explain architecture-dotnet
```

The test sensor runs only [application tests](tests/application), not the
harness self-tests or `npm run check`. This avoids recursively invoking
`verify`. Warnings from lint and skipped application tests require correction.
No tests, empty scope, mismatched counts, missing reports, timed-out tools, and
failed tool startup are errors, not passing evidence.

The shared [process runner](.harness/lib/process.ts) uses argument arrays,
non-interactive execution, time/output bounds, cancellation, and local
diagnostic logs. The adapters interpret reports; a nonzero exit alone cannot
distinguish a legitimate finding from a broken tool.

`doctor` lists declared external prerequisites without installing or probing
them. The optional .NET sensor does not run during default `verify`.

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

## Run the blog's .NET architecture example

The [optional .NET companion](examples/dotnet/README.md) implements the
NetArchTest controller rule from
[Refining Inferential Sensors in Coding Agent Harnesses](https://dasith.me/2026/06/20/refining-inferential-sensors/).
It is a separate layered .NET 10 sample, not a replacement for the Node-only
quick start.

With the .NET 10 SDK on PATH:

```bash
./harness sensors run architecture-dotnet
npm run test:dotnet
```

The sensor builds current source with locked NuGet dependencies, then runs
architecture tests against that exact build. It checks the rule executed and
that result counts agree. Broken builds and test setup failures produce
`status: error`; a confirmed dependency violation produces `status: fail`
with `ARCH001` and the offending types.

The companion includes good/bad controller variants and tests for nested
namespace selection. To make it mandatory in a .NET repository, explicitly
add `architecture-dotnet` to the reviewed required-sensor policy. It is
exercised in a separate CI job so default Node users do not need the SDK.

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
* Bounded subprocess stdout/stderr and fresh build/test artifacts under `tools/`
* Minimal session-start/end metadata when an integration is enabled

```bash
./harness telemetry
```

Telemetry failures are investigation signals. A useful failing test is not
necessarily waste. Look for repeated setup confusion, ineffective repairs,
or duplicated discovery before changing a command or instruction.

The harness uploads no telemetry. Wrapped tools may access package feeds,
and application tests can perform whatever I/O their code requests.
Prompts, transcripts, source contents, tool arguments, and account names are
not recorded in telemetry. Finding reports contain locations and diagnostic
messages. Raw tool logs can include absolute paths, source snippets, or data
printed by tests. They remain ignored local files; review before sharing and
remove them according to your team's retention policy.
This sample uses local JSONL, not an OpenTelemetry exporter; connect it to
your organisation's collector only after deciding retention and redaction policy.

## Develop and validate

```bash
npm run typecheck
npm test
npm run test:app
npm run lint
npm run build
npm run skill:generate
npm run skill:check
./harness verify
```

`npm run check` runs the complete sequence except generation: stale committed
skill content fails CI.

The tests exercise real CLI subprocesses, extension discovery, rule violations,
staleness, malformed output, truncation, version startup, time/output limits,
lint/test/build failures, and integration
configuration/bridge contracts. Agent integrations are not end-to-end certified
against live client sessions.

## License and attribution

[MIT](LICENSE). AXI design principles are credited to
[Kuncheng and the AXI project](https://github.com/kunchenguid/axi).
The architecture scenario and harness implementation here are original sample
code. No third-party benchmark results are claimed for this implementation.
