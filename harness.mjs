#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "./.harness/version.mjs";

const args = process.argv.slice(2);
if (args.length === 1 && ["-v", "-V", "--version"].includes(args[0])) {
  console.log(VERSION);
} else {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    console.log('status: error\nerror: "Node.js 22.12 or later is required"\nhelp: "Install a supported Node.js release, then rerun ./harness doctor"');
    process.exitCode = 1;
  } else {
    const require = createRequire(import.meta.url);
    let installed = true;
    try {
      require.resolve("tsx/esm/api");
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
      installed = false;
      console.log('status: error\nerror: "Repository dependencies are not installed"\nhelp: "Run npm ci from the repository root, then ./harness doctor"');
      process.exitCode = 1;
    }
    if (installed) {
      const { register } = await import("tsx/esm/api");
      register();
      const { main } = await import("./.harness/cli.ts");
      await main(args, dirname(fileURLToPath(import.meta.url)));
    }
  }
}
