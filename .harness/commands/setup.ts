import { defineCommand } from "../lib/contracts.ts";
import { agents, installIntegration } from "../lib/setup.ts";

export default defineCommand({
  description: "Opt in to project-local lifecycle integrations; preserve unrelated hooks and repair paths",
  examples: ["./harness setup --agent copilot", "./harness setup --agent all"],
  options: [{ flags: "--agent <agent>", description: "Client to configure (default: all)", choices: [...agents, "all"], default: "all" }],
  async run(context, _args, options) {
    const selected = agents.filter(agent => options.agent === "all" || options.agent === agent);
    const results = [];
    for (const agent of selected) results.push({ agent, ...await installIntegration(context.root, agent) });
    const changed = results.filter(result => result.changed);
    return {
      data: { status: "configured", integrations: results, help: ["Review the generated local configuration and trust it in your agent before starting a new session"] },
      silent: changed.length === 0
    };
  }
});
