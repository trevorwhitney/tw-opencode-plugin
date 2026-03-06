import type { Plugin } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";
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

    "command.execute.before": async (input, output) => {
      const prompts =
        input.command === "code-review"
          ? codeReviewPrompts
          : input.command === "plan-review"
            ? planReviewPrompts
            : null;

      if (!prompts) return;

      const config = await loadReviewConfig();
      const synthesisPrompt = await runReviewPipeline(
        client,
        input.sessionID,
        input.arguments,
        prompts,
        config,
      );

      // Part type requires id/sessionID/messageID but the hook runtime
      // accepts partial objects for constructing new message parts.
      output.parts.length = 0;
      output.parts.push({ type: "text", text: synthesisPrompt } as Part);
    },
  };
};
