import type { Config } from "@opencode-ai/sdk";
import {
  parseMarkdownWithFrontmatter,
  createVendorHelpers,
} from "../shared/vendor-utils.js";

const { readVendorFile, listVendorFiles } = createVendorHelpers(
  import.meta.url,
);

// ---------------------------------------------------------------------------
// String constants
// ---------------------------------------------------------------------------

const BEADS_CLI_USAGE = `## CLI Usage

**IMPORTANT:** There is no \`bd\` tool in this environment. You must use the \`bash\` tool to run the \`bd\` command.

**Do not try to call a tool named \`bd\` directly.** It does not exist.
**Do not try to call MCP tools (like \`ready\`, \`create\`) directly.** They do not exist.

Instead, use the \`bash\` tool for all beads operations:

- \`bd init [prefix]\` - Initialize beads
- \`bd ready --json\` - List ready tasks
- \`bd show <id> --json\` - Show task details
- \`bd create "title" -t bug|feature|task -p 0-4 --json\` - Create issue
- \`bd update <id> --status in_progress --json\` - Update status
- \`bd close <id> --reason "message" --json\` - Close issue
- \`bd reopen <id> --json\` - Reopen issue
- \`bd dep add <from> <to> --type blocks|discovered-from --json\` - Add dependency
- \`bd list --status open --json\` - List issues
- \`bd blocked --json\` - Show blocked issues
- \`bd stats --json\` - Show statistics

If a tool is not listed above, try \`bd <tool> --help\`.

Always use \`--json\` flag for structured output.`;

const BEADS_SUBAGENT_CONTEXT = `## Subagent Context

You are called as a subagent. Your **final message** is what gets returned to the calling agent - make it count.

**Your purpose:** Handle both status queries AND autonomous task completion.

**For status/overview requests** ("what's next", "show me blocked work"):
- Run the necessary \`bd\` commands to gather data
- Process the JSON output internally
- Return a **concise, human-readable summary** with key information
- Use tables or lists to organize information clearly
- Example: "You have 3 ready tasks (2 P0, 1 P1), 5 in-progress, and 8 blocked by Epic X"

**For task completion requests** ("complete ready work", "work on issues"):
- Find ready work, claim it, execute it, close it
- Report progress as you work
- End with a summary of what was accomplished

**Critical:** Do NOT dump raw JSON in your final response. Parse it, summarize it, make it useful.`;

export const BEADS_GUIDANCE = `<beads-guidance>
${BEADS_CLI_USAGE}

## Agent Delegation

**Default to the agent.** For ANY beads work involving multiple commands or context gathering, use the \`task\` tool with \`subagent_type: "beads-task-agent"\`:
- Status overviews ("what's next", "what's blocked", "show me progress")
- Exploring the issue graph (ready + in-progress + blocked queries)
- Finding and completing ready work
- Working through multiple issues in sequence
- Any request that would require 2+ bd commands

**Use CLI directly ONLY for single, atomic operations:**
- Creating exactly one issue: \`bd create "title" ...\`
- Closing exactly one issue: \`bd close <id> ...\`
- Updating one specific field: \`bd update <id> --status ...\`
- When user explicitly requests a specific command

**Why delegate?** The agent processes multiple commands internally and returns only a concise summary. Running bd commands directly dumps hundreds of lines of raw JSON into context, wasting tokens and making the conversation harder to follow.
</beads-guidance>`;

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export async function loadCommands(): Promise<Config["command"]> {
  const files = await listVendorFiles("commands");
  const commands: Config["command"] = {};
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = await readVendorFile(`commands/${file}`);
    if (!content) continue;
    const parsed = parseMarkdownWithFrontmatter(content);
    if (!parsed) continue;
    const name = `beads:${file.replace(".md", "")}`;
    const argHint = parsed.frontmatter["argument-hint"];
    const baseDescription = parsed.frontmatter.description ?? name;
    const description = argHint ? `${baseDescription} (${argHint})` : baseDescription;
    commands[name] = { description, template: parsed.body };
  }
  return commands;
}

export async function loadAgent(): Promise<Config["agent"]> {
  const content = await readVendorFile("agents/task-agent.md");
  if (!content) return {};
  const parsed = parseMarkdownWithFrontmatter(content);
  if (!parsed) return {};
  const description = parsed.frontmatter.description ?? "Beads task completion agent";
  return {
    "beads-task-agent": {
      description,
      prompt: BEADS_CLI_USAGE + "\n\n" + BEADS_SUBAGENT_CONTEXT + "\n\n" + parsed.body,
      mode: "subagent",
    },
  };
}
