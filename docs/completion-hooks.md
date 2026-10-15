---
title: Verify Work Before the Agent Finishes
description: "Wire harness verify to Copilot, Claude Code, Codex, and VS Code completion hooks, with an advisory OpenCode alternative."
---

## What this adds

The existing `./harness setup` integrations provide startup context and
lifecycle metadata. They do not run verification when the agent finishes.
This guide adds a separate, explicitly enabled completion check.

```text
Agent attempts to finish a response
                |
          harness verify
                |
      pass -----+----- fail or cannot check
       |                    |
 allow stop       return findings to the agent
                            |
                   one repair opportunity
                            |
                       re-verify
                            |
               pass or explicit human handoff
```

Use a completion event, not `SessionEnd`. A session can remain open after
many completed responses; session-end callbacks can be too late to request
correction. A stop event is also not proof of completed code: these examples
run after ordinary responses, including explanations. They deliberately do
not guess readiness by searching the final message for words like "done".

## Select the actual harness

| Host | Event | Can request continued work? | Failed-check output |
|------|-------|------------------------------|---------------------|
| Copilot CLI / Copilot harness in VS Code | `agentStop` | Yes, when the selected runtime supports it | Top-level `decision: block` and `reason` |
| VS Code Local harness | `Stop` | Yes | `hookSpecificOutput` containing `hookEventName: Stop`, `decision: block`, and `reason` |
| Claude Code | `Stop` | Yes | Top-level `decision: block` and `reason` |
| Codex | `Stop` | Yes | Top-level `decision: block` and `reason` |
| OpenCode 1.19 plugin | `session.idle` | Advisory observation after idle, not a stop veto | Report/log the result; do not assume a returned decision blocks completion |

VS Code's Session Target determines the harness, not the selected model.
Copilot and Local sessions can discover similarly named files but interpret
their payloads differently. Choose one configuration below for the intended
runtime. Do not install both Copilot and Local versions of this check in the
same checkout and assume they will be deduplicated.

## Use the supplied adapter

The optional
[verify-on-stop adapter](../.harness/integrations/verify-on-stop.mjs) runs:

```bash
node /absolute/path/to/repo/harness.mjs verify
```

It determines the repository from its own location, validates the hook input
and working directory, runs a fresh check, and translates the outcome into
the host's JSON protocol. It uses the shared bounded process runner rather
than interpolating hook input into a shell command.

Why not configure `./harness verify` directly? Its exit code `1` means failed
expectations or an execution error, but several hook runtimes treat that
exit as a non-blocking hook failure. Its TOON output is also not the hook's
JSON decision format. The adapter returns hook exit `0` with a blocking JSON
decision when another agent turn is appropriate.

The adapter has a 90-second verification timeout. The examples give the
outer hook 120 seconds so it can receive that explicit failure response.
If you add slower sensors, adjust both budgets after measuring them.
Do not use asynchronous hooks for a completion decision.

No configuration is enabled by adding this guide or by installing packages.
The adapter is not included in `./harness setup`; enabling it is a manual,
reviewed action described below.

## Copilot CLI and VS Code Copilot harness

Create `.github/hooks/harness-verify.json` with the following content.
Replace `/absolute/path/to/repo` with this checkout's absolute path.

```json
{
  "version": 1,
  "hooks": {
    "agentStop": [
      {
        "type": "command",
        "bash": "node '/absolute/path/to/repo/.harness/integrations/verify-on-stop.mjs' copilot",
        "timeoutSec": 120
      }
    ]
  }
}
```

Review and trust the hook, then start a new session. In VS Code, select the
Copilot harness and confirm this event is available in your installed version.
The Copilot adapter uses the documented top-level decision contract even
when the client is hosted inside VS Code.

Do not rely on exit `2` alone for Copilot `agentStop`: its generic command
hook error handling differs from Claude's. Use the JSON decision returned
by the adapter.

## VS Code Local harness

For the Local Session Target, use this instead in
`.github/hooks/harness-verify.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "node '/absolute/path/to/repo/.harness/integrations/verify-on-stop.mjs' vscode-local",
        "timeout": 120
      }
    ]
  }
}
```

Enable hooks for the Local harness, trust the workspace, and inspect the
hook in VS Code's Agent Customizations editor. Use the Local hook output
channel or agent debug logs to confirm execution and blocking.

## Claude Code

Merge the `Stop` entry into `.claude/settings.local.json` for a local opt-in,
or `.claude/settings.json` for a reviewed team configuration:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node '/absolute/path/to/repo/.harness/integrations/verify-on-stop.mjs' claude-code",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

Preserve existing settings and hook entries. Do not replace the file with
this fragment if it already contains configuration.

Claude's Stop event runs when the main agent finishes responding, not on
user interruption. API failures use `StopFailure`, which is not a substitute
completion gate. Do not copy this onto every `SubagentStop`: parallel
subagents may be working against incomplete shared state.

## Codex

Merge this entry into `.codex/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node '/absolute/path/to/repo/.harness/integrations/verify-on-stop.mjs' codex",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

Use Codex's `/hooks` interface to review and trust the exact definition.
Project-local hooks require a trusted project configuration layer.
Do not bypass trust as an installation step. Older client versions may
require additional feature configuration; check the installed version's
documentation rather than blindly adding an obsolete feature flag.

Codex requires JSON stdout for a successful Stop hook. A blocking reason
becomes the continuation prompt; it should contain scoped repair guidance,
not a request to weaken the sensor or acceptance criteria.

## OpenCode: verify at idle, without claiming a blocking gate

The published OpenCode 1.19 plugin event API does not provide the same Stop
decision contract. An idle callback can run verification and report failure,
but returning `{ "decision": "block" }` from it is not a completion veto.

For an advisory check, create `.opencode/plugins/harness-verify.mjs`:

```javascript
import { execFile } from "node:child_process";

const adapter = "/absolute/path/to/repo/.harness/integrations/verify-on-stop.mjs";

export const HarnessVerify = async ({ directory }) => {
  const inFlight = new Set();
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return;
      const session = event.properties.sessionID;
      if (inFlight.has(session)) return;
      inFlight.add(session);
      try {
        const result = await new Promise((resolve, reject) => {
          const child = execFile("node", [adapter, "opencode"], {
            timeout: 120000,
            maxBuffer: 1024 * 1024
          }, (error, stdout, stderr) => {
            if (error) return reject(new Error(`Completion verification failed to run: ${stderr}`));
            try {
              resolve(JSON.parse(stdout));
            } catch (parseError) {
              reject(parseError);
            }
          });
          child.stdin.end(JSON.stringify({ cwd: directory }));
        });
        if (!result.verified) {
          console.error(`Harness verification unresolved: ${result.message}`);
        }
      } finally {
        inFlight.delete(session);
      }
    }
  };
};
```

This deliberately does not send another prompt from inside `session.idle`;
doing so without a retry guard can create an idle/prompt loop. The result
is stored locally and failures go to plugin diagnostics. Ask the agent to
run `./harness verify` before finishing, and use required CI for enforcement.
Recheck the plugin API before adapting this to a different OpenCode version.

## One retry is a budget, not proof of acceptance

For Copilot, Claude, Codex, and Local, the adapter requires the documented
boolean `stop_hook_active` input:

* On the first failed check, request one corrective turn.
* On the forced continuation's completion, run verification again.
* If it passes, allow stopping.
* If it still fails or cannot run, stop requesting more automatic turns,
  emit an explicit diagnostic, and record unresolved verification.

The local record is `.harness/state/completion/latest.json`. Read its
`verified` and `status` fields, not the adapter's exit code, to inspect
acceptance evidence. It records the latest invocation, not a durable
per-session audit log. Sensor reports and tool logs provide the detailed
history.

On retry exhaustion, Copilot receives `decision: allow` and the unresolved
result is in stderr/local state; other Stop targets also receive a
`systemMessage`. Message visibility varies by host. Allowing the response
to stop is a human-handoff policy, not a successful verification result.
Another stop hook may also set `stop_hook_active`, so this budget is shared
with the host's continuation state rather than guaranteed exclusive to this
adapter.

If you need a stricter team policy, implement a reviewed per-session retry
budget and escalation mechanism. Do not simply remove loop protection:
Copilot and Claude have their own runaway guards, and hooks can be disabled,
untrusted, timed out, or interrupted. Keep CI as the acceptance boundary.

## Paths, permissions, and timing

The shown commands target POSIX shells. Quote the absolute adapter path,
and use an absolute Node executable if the agent's PATH does not contain
the correct runtime. Paths containing a single quote need shell-appropriate
escaping; do not paste untrusted paths into command strings.

For native Windows, use the selected host's Windows command override and
double-quoted Windows paths; for example the Local harness supports `windows`
and Copilot supports `powershell`. Validate those overrides on Windows.
The examples and adapter tests here were exercised on Linux.

The wrapper uses its own repository root and only verifies payload working
directories within that checkout. Use a separate reviewed installation for
each worktree. Do not install it globally and assume the root follows the
current directory. Concurrent edits can make verification stale; finish
background code-changing tasks before attempting completion.

The Node-only default should fit comfortably within the example timeout.
The optional .NET sensor is not in default `verify`. If you make it required,
account for restore/build time, SDK availability, and network policy.

## Test before enabling

From the repository root, simulate the initial hook invocation:

```bash
printf '{"cwd":"%s","stop_hook_active":false}' "$PWD" |
  node .harness/integrations/verify-on-stop.mjs copilot
```

This shell example assumes the working-directory path contains no JSON
special characters. For other paths, generate the payload with a JSON
serializer instead of interpolating it.

Use the supplied bad controller variant to introduce a known architecture
violation. Confirm the adapter returns a blocking decision, not just exit
`1`. Repeat with `stop_hook_active: true`; confirm it rechecks and records
`verified: false` without requesting endless retries. Restore the good
controller and confirm a fresh pass.

```bash
node --import tsx --test tests/completion-hooks.test.ts
```

The adapter tests exercise success, failure, retry handling, invalid output,
missing dependencies, and repository scope. They validate the protocol
responses, not a live end-to-end session in every supported client.
Finally test in the actual agent: observe the hook log, the repair turn,
and the second verification. A hook showing up in settings is not proof
that it executed or blocked completion.

## Preserve the real gate

Require the repository's CI verification check before merge. Hook files,
the adapter, sensors, and policy are editable code and need review.
Never let a failing agent change them solely to declare success.

This is the intended relationship:

> Sensors report evidence; the completion hook requests correction; protected
> CI and human review govern acceptance.

## References

Official references checked on 2026-10-16:

* [Copilot hook input and decision contracts](https://docs.github.com/en/copilot/reference/hooks-reference)
* [Choosing the VS Code hook implementation](https://code.visualstudio.com/docs/agent-customization/hooks)
* [VS Code Local Stop reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference#_stop)
* [Claude Code Stop hooks](https://code.claude.com/docs/en/hooks#stop)
* [Codex hooks](https://developers.openai.com/codex/hooks/)
* [OpenCode plugins](https://opencode.ai/docs/plugins/)
* [OpenCode v1.19.0 plugin interface](https://github.com/anomalyco/opencode/blob/v1.19.0/packages/plugin/src/index.ts)
