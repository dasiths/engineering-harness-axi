import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { source } from "./helpers.ts";

test("documentation has metadata and resolves local file links", async () => {
  for (const name of ["README.md", "AGENTS.md", "docs/extending.md", "docs/axi.md", "docs/integrations.md", "examples/dotnet/README.md", ".agents/skills/engineering-harness/SKILL.md"]) {
    const file = join(source, name);
    const text = await readFile(file, "utf8");
    assert.match(text, /^---\n/);
    assert.match(text, /\ndescription:/);
    for (const match of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      const target = match[1]!;
      if (/^https?:/.test(target)) continue;
      await access(resolve(dirname(file), target));
    }
  }
});
