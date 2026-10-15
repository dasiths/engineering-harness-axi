import { defineCommand } from "../lib/contracts.ts";
import { home } from "../lib/home.ts";

export default defineCommand({
  description: "Show current repository evidence, not an automatic full check",
  examples: ["./harness", "./harness --help"],
  async run(context) {
    return { data: await home(context) };
  }
});
