import { type Plugin, tool } from "@opencode-ai/plugin";
import { loadReviewConfig } from "./review/config.js";
import { runReviewPipeline } from "./review/pipeline.js";
import { codeReviewPrompts, planReviewPrompts, specReviewPrompts } from "./review/prompts/index.js";
import type { EventSessionCompacted } from "@opencode-ai/sdk";
import {
  loadCommands,
  loadAgent,
  createBeadsContextManager,
  BEADS_AWARENESS,
} from "./beads/index.js";
import { loadCommands as loadWorkmuxCommands } from "./workmux/index.js";

// ---------------------------------------------------------------------------
// Tool priority rules — injected into the system prompt so the model always
// prefers CLI tools over MCP equivalents, without needing to load a skill.
// ---------------------------------------------------------------------------
const TOOL_PRIORITY_RULES = `<tool-priority-rules>
## Tool Priority Rules

These rules override default tool selection. Follow them unconditionally.

### GitHub: prefer \`gh\` CLI over GitHub MCP tools

When performing ANY GitHub operation (PRs, issues, releases, actions, repo management):

1. **Always use the \`gh\` CLI via the Bash tool first.**
2. Only fall back to GitHub MCP tools (\`github_*\`) when:
   - \`gh\` fails or returns an error for the specific operation
   - The operation is genuinely not supported by \`gh\` (rare)
   - The user explicitly asks you to use a specific MCP tool

Common operations — use these instead of MCP tools:
- \`gh pr view <number>\` instead of \`github_get_pull_request\`
- \`gh pr list\` instead of \`github_list_pull_requests\`
- \`gh pr diff <number>\` instead of \`github_get_pull_request_files\`
- \`gh pr checks <number>\` instead of \`github_get_pull_request_status\`
- \`gh pr create\` instead of \`github_create_pull_request\`
- \`gh pr review <number>\` instead of \`github_create_pull_request_review\`
- \`gh issue view <number>\` instead of \`github_get_issue\`
- \`gh issue list\` instead of \`github_list_issues\`
- \`gh issue create\` instead of \`github_create_issue\`
- \`gh api <endpoint>\` for any REST/GraphQL call not covered above

### Grafana: prefer \`grafana-assistant\` CLI over Grafana MCP tools

When querying Grafana for metrics, logs, traces, alerts, or dashboards:

1. **Always try \`grafana-assistant\` CLI via the Bash tool first.**
2. Only fall back to Grafana MCP tools (\`mcp-grafana_*\`) when:
   - \`grafana-assistant\` fails or returns an error
   - You need an MCP-only operation (creating/updating dashboards, alert rules, or incidents)
   - The user explicitly asks you to use a specific MCP tool

### Worktrees

Place worktrees as siblings to this project directory, under \`~/workspace/project/\`.
For example, a worktree tracking branch \`foo\` should go to \`~/workspace/project/foo\`.
</tool-priority-rules>`;

export const TwOpenCodePlugin: Plugin = async ({ $, client }) => {
  const [beadsCommands, beadsAgents, workmuxCommands] = await Promise.all([
    loadCommands(),
    loadAgent(),
    loadWorkmuxCommands(),
  ]);
  const beads = createBeadsContextManager(client, $);

  return {
    // Inject tool priority rules into every system prompt so the model
    // always knows to prefer CLI tools without needing to load a skill.
    "experimental.chat.system.transform": async (_input, output) => {
      (output.system ||= []).push(TOOL_PRIORITY_RULES);
      output.system.push(BEADS_AWARENESS);
    },

    "chat.message": async (_input, output) => {
      await beads.handleChatMessage(_input, output);
    },

    event: async ({ event }) => {
      const type = event.type as string;
      switch (type) {
        case "session.status": {
          const props = event.properties as
            | { status?: { type?: string } }
            | undefined;
          if (props?.status?.type === "busy") {
            await $`workmux set-window-status working`.quiet().nothrow();
          }
          if (props?.status?.type === "idle") {
            await $`workmux set-window-status done`.quiet().nothrow();
          }
          break;
        }
        case "permission.asked":
        case "question.asked":
          await $`workmux set-window-status waiting`.quiet().nothrow();
          break;
        case "session.idle":
          await $`workmux set-window-status done`.quiet().nothrow();
          break;
        case "session.created":
        case "global.disposed":
          await $`workmux set-window-status clear`.quiet().nothrow();
          break;
        case "session.compacted":
          await beads.handleCompactionEvent(event as EventSessionCompacted);
          break;
      }
    },

    tool: {
      "review-pipeline": tool({
        description:
          "Run a multi-reviewer pipeline. Configured agents independently review the target, " +
          "then cross-examine each other's findings. Returns all review rounds for synthesis. " +
          "Use this tool when the user runs /code-review, /plan-review, or /spec-review.",
        args: {
          type: tool.schema.enum(["code-review", "plan-review", "spec-review"]),
          target: tool.schema.string().describe(
            "The review target — a PR URL, file paths, commit range, spec content, or description of what to review"
          ),
        },
        async execute(args, context) {
          const prompts =
            args.type === "code-review"
              ? codeReviewPrompts
              : args.type === "plan-review"
                ? planReviewPrompts
                : specReviewPrompts;
          const config = await loadReviewConfig();

          const synthesisText = await runReviewPipeline(
            client,
            context.sessionID,
            args.target,
            prompts,
            config,
          );

          return synthesisText;
        },
      }),
    },

    config: async (config) => {
      config.command = { ...config.command, ...beadsCommands, ...workmuxCommands };
      config.agent = { ...config.agent, ...beadsAgents };
    },
  };
};
