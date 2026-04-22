import { type Plugin, tool } from "@opencode-ai/plugin";
import { loadReviewConfig } from "../review/config.js";
import { runReviewPipeline } from "../review/pipeline.js";
import { codeReviewPrompts, planReviewPrompts, specReviewPrompts } from "../review/prompts/index.js";
import type { EventSessionCompacted } from "@opencode-ai/sdk";
import {
  loadCommands,
  loadAgent,
  createBeadsContextManager,
  BEADS_AWARENESS,
} from "../beads/index.js";
import { loadCommands as loadWorkmuxCommands } from "../workmux/index.js";
import { TOOL_PRIORITY_RULES } from "../tool-priority-rules.js";
import { createOpencodeRunner } from "./runner.js";

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

          const runner = createOpencodeRunner(client, context.sessionID);
          const synthesisText = await runReviewPipeline(
            runner,
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
