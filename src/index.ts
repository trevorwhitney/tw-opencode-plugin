import { type Plugin, tool } from "@opencode-ai/plugin";
import { loadReviewConfig } from "./review/config.js";
import { runReviewPipeline } from "./review/pipeline.js";
import { codeReviewPrompts, planReviewPrompts } from "./review/prompts/index.js";

// Patch: workmux's built-in plugin listens for the v1 SDK event name
// "permission.updated", but OpenCode >=1.x emits "permission.asked".
// This plugin fills that gap so `workmux set-window-status waiting`
// fires when OpenCode needs user input.

export const TwOpenCodePlugin: Plugin = async ({ $, client }) => {
  return {
    event: async ({ event }) => {
      const type = event.type as string;
      switch (type) {
        case "permission.asked":
        case "question.asked":
          await $`workmux set-window-status waiting`.quiet();
          break;
        case "permission.replied":
        case "question.replied":
          await $`workmux set-window-status working`.quiet();
          break;
      }
    },

    tool: {
      "review-pipeline": tool({
        description:
          "Run a dual-reviewer pipeline. Two agents independently review the target, " +
          "then cross-examine each other's findings. Returns all review rounds for synthesis. " +
          "Use this tool when the user runs /code-review or /plan-review.",
        args: {
          type: tool.schema.enum(["code-review", "plan-review"]),
          target: tool.schema.string().describe(
            "The review target — a PR URL, file paths, commit range, or description of what to review"
          ),
        },
        async execute(args, context) {
          const prompts =
            args.type === "code-review" ? codeReviewPrompts : planReviewPrompts;
          const config = await loadReviewConfig();

          try {
            const synthesisText = await runReviewPipeline(
              client,
              context.sessionID,
              args.target,
              prompts,
              config,
              (status) => context.metadata({ title: status }),
            );

            return synthesisText;
          } catch (err) {
            context.metadata({ title: "Review pipeline failed" });
            throw err;
          }
        },
      }),
    },
  };
};
