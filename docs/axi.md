---
title: AXI Design and Verification
description: "Map this sample to a pinned AXI specification and disclose verification limits."
---

## Reference and claim

The design follows the ten principles in
[AXI revision b7dbc13](https://github.com/kunchenguid/axi/blob/b7dbc1324ce637f08835ce5c45783a24287511f2/.agents/skills/axi/SKILL.md).
This is a principle-by-principle implementation, not independent certification
or a promise of identical behaviour across all agent-client versions.

## Implementation map

| Principle | Implementation and evidence |
|-----------|-----------------------------|
| Token-efficient output | Pinned TOON encoder at the output boundary; internal typed objects; round-trip output tests |
| Minimal default schemas | Three/four-field catalogues and finding rows; validated `--fields` |
| Content truncation | Long diagnostic previews with total character counts; immutable report retrieval with `--full` |
| Pre-computed aggregates | Total versus shown counts, finding totals, and current evidence status |
| Definitive empty states | Explicit no-findings/no-sensors/no-telemetry states; zero checked items is an error |
| Structured errors and exit codes | Structured stdout errors, separate stderr diagnostics, strict argument rejection before sensor execution, idempotent setup |
| Ambient context | Opt-in project-local setup for four clients; scoped dashboard and minimal lifecycle metadata; generated on-demand skill |
| Content first | No-argument invocation reports real evidence without executing sensors |
| Contextual disclosure | Specific sensor and report commands, truncation escape hatches, no suggestions on self-contained successful reports |
| Consistent help | Generated subcommand help/examples, executable path and purpose, bare version aliases with a Node-startup-relative test |

## Intentional scope and limitations

* Hook installation is POSIX-only. The base CLI also has a Windows launcher.
* Adapters are checked against documented configuration and payload contracts.
  Live end-to-end sessions in all clients have not been certified.
* Session capture is deliberately metadata-only. Full transcripts and arbitrary
  tool activity need a separately approved agent-observability setup.
* The home dashboard caps its summary at ten sensors and points to the full
  catalogue. Lists default to 100 rows and expose `--limit` and `--full`.
* The workspace fingerprint is conservative and includes documentation and
  harness changes, not only source. State and generated local integrations are
  excluded. Large repositories should replace this with a carefully tested
  relevant-input model rather than claim that every old pass is current.
* Discovery imports trusted modules to read metadata. TypeScript validation and
  tests enforce contracts, not a sandbox for untrusted plugins.
* Command validation and definition errors are explicit. Failed execution is not
  downgraded to an empty successful report.
* There is no automatic dependency installation or automatic repair. Prerequisite
  failures tell the user how to bootstrap the repository. The optional .NET
  build restores its locked NuGet packages; the user installs the SDK separately.
* The Node quick start requires Node 22.13+ or 24+ to use a supported ESLint
  release. Default verification runs five Node-only sensors. The sixth,
  `architecture-dotnet`, is optional and requires .NET 10.
* Subprocess output and report formats are validated before observations are
  accepted. Nonzero exit codes alone do not count as a confirmed violation.
  Tool logs remain local and may contain more sensitive detail than telemetry.

No token-savings percentage is asserted for this sample. Output economy and
end-to-end task outcomes need measurement in the user's actual workflow.

## Conformance checks

```bash
npm run check
```

The test suite verifies version aliases without dependencies, a version startup
budget relative to a local Node startup, command and sensor discovery from new
files, generated skill freshness, input rejection, report truncation, evidence
staleness, known architecture violations, and integration contracts.

Before claiming broader compliance, test the adapters in the actual deployed
client versions and evaluate privacy, retention, and policy enforcement for
that environment.
