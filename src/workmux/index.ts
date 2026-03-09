import type { Config } from "@opencode-ai/sdk";
import {
  parseMarkdownWithFrontmatter,
  createVendorHelpers,
} from "../shared/vendor-utils.js";

const { readVendorFile, listVendorFiles } = createVendorHelpers(
  import.meta.url,
);

export async function loadCommands(): Promise<Config["command"]> {
  const files = await listVendorFiles("commands");
  const commands: Config["command"] = {};
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = await readVendorFile(`commands/${file}`);
    if (!content) {
      console.warn(`[workmux] failed to read vendor file: commands/${file}`);
      continue;
    }
    const parsed = parseMarkdownWithFrontmatter(content);
    if (!parsed) {
      console.warn(`[workmux] failed to parse frontmatter: commands/${file}`);
      continue;
    }
    const name = `workmux:${file.replace(".md", "")}`;
    const description = parsed.frontmatter.description ?? name;
    commands[name] = { description, template: parsed.body };
  }
  return commands;
}
