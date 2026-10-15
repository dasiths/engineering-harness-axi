---
title: Agent Integrations
description: "Opt-in live context for Copilot CLI, Claude Code, Codex, and OpenCode."
---

## Guidance versus execution

[AGENTS.md](../AGENTS.md) provides static repository guidance. Some clients have
different instruction discovery rules; the setup adapters provide live context
without assuming that every client reads that file.

Lifecycle hooks inject the current dashboard. They are not stop hooks and do
not block agent completion. CI runs fresh required checks; repository rulesets
must make that check mandatory if it is to gate merging.

To run `harness verify` when work completes, use the separate
[completion-hook guide](completion-hooks.md). It includes a tested adapter,
per-client configurations, bounded correction attempts, and the distinction
between completion and session-end events. These hooks are manual opt-in;
`setup` continues to install only the startup/lifecycle integrations below.

## Explicit setup

```bash
./harness setup --agent copilot
./harness setup --agent claude-code
./harness setup --agent codex
./harness setup --agent opencode
```

`--agent all` is the default when setup is explicitly invoked without a target.
It configures all four. Ordinary CLI commands never install integrations.
Generated files are ignored by Git because they contain machine-specific paths.

| Target | Project-local integration | Context delivery |
|--------|---------------------------|------------------|
| Copilot CLI | `.github/hooks/engineering-harness.json` | `sessionStart` JSON `additionalContext` |
| Claude Code | `.claude/settings.local.json` | `SessionStart` JSON `hookSpecificOutput.additionalContext` |
| Codex | `.codex/hooks.json` | `SessionStart` JSON `hookSpecificOutput.additionalContext` |
| OpenCode 1.19 | `.opencode/plugins/engineering-harness.mjs` | `experimental.chat.system.transform` |

Review the generated configuration and follow the client's hook trust process.
Restart the session to receive the new context. Do not bypass workspace or
hook trust merely to make the example run.

The sample targets POSIX hook commands (Linux/macOS/WSL). On native Windows,
use static guidance or the generated skill with `node ./harness.mjs`.
VS Code and Copilot Agent Host can have different lifecycle schemas and trust
controls from Copilot CLI. This sample does not claim live compatibility with
every Copilot surface.

## Preservation and relocation

Setup preserves unrelated hook groups and settings. Repeating setup for the
same path is a silent no-op. If the checkout moves, rerun setup to replace its
managed bridge paths. An unmanaged OpenCode plugin at the target path is not
overwritten.

The Node runtime uses a PATH name only when its real path matches the current
executable; otherwise setup records its absolute path. The bridge uses the
absolute repository path, so starting from a nested directory still works.
Contexts from outside this repository are ignored.

## Privacy and lifecycle capture

Session-start and session-end hooks append only timestamp, agent, event kind,
and a hashed session identifier to local telemetry. Prompt content and
transcript paths in hook payloads are ignored. The payload is bounded to
64 KiB and never persisted verbatim.

OpenCode's system-context hook caches the dashboard per session and refreshes
it in a new session. Its deletion event supplies lifecycle-end metadata; it is
not a guarantee that every abandoned session produces an end event.

CLI commands record duration, outcome, and sensor evidence independently.
This is not a complete reconstruction of arbitrary agent activity or an
OpenTelemetry exporter. To inspect failures in tools outside this CLI, use the
agent harness's own approved observability configuration.

Generated integration errors are explicit. Missing dependencies, bad payloads,
or a failed dashboard do not yield fabricated successful context. The host may
still continue the agent session: these hooks provide context, not enforcement.

## Optional skill

The generated [engineering-harness skill](../.agents/skills/engineering-harness/SKILL.md)
is an alternative, on-demand discovery route.

```bash
npx skills add dasiths/engineering-harness-axi --skill engineering-harness
```

Review the installer before execution. The skill does not install the harness
binary. It requires a checkout that contains the sample, or has adopted the
harness, and uses `node ./harness.mjs` without relying on a global executable.

Use the hook for live startup context or the skill for task-triggered discovery.
Both can coexist, but neither is required to use the CLI.

## Verification scope and references

Configuration generation, preservation, idempotency, path repair, scope checks,
hook response shapes, and the OpenCode callback contract are tested locally.
Live sessions in all four clients were not executed as part of building this
sample. Check your installed version's documentation before rollout.

References consulted on 2026-10-16:

* [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
* [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
* [Codex hooks](https://developers.openai.com/codex/hooks/)
* [OpenCode plugin guide](https://opencode.ai/docs/plugins/)
* [OpenCode v1.19.0 plugin interface](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/plugin/src/index.ts)
