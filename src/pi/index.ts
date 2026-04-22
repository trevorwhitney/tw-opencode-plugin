import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { TOOL_PRIORITY_RULES } from "../tool-priority-rules.js";
import { loadReviewConfig } from "../review/config.js";
import { runReviewPipeline } from "../review/pipeline.js";
import {
  codeReviewPrompts,
  planReviewPrompts,
  specReviewPrompts,
} from "../review/prompts/index.js";
import { createPiRunner } from "./runner.js";

export default function (pi: ExtensionAPI) {
  // Inject tool priority rules into every system prompt
  pi.on("before_agent_start", async (event, _ctx) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + TOOL_PRIORITY_RULES,
    };
  });

  // Register the review pipeline tool
  pi.registerTool({
    name: "review_pipeline",
    label: "Review Pipeline",
    description:
      "Run a multi-reviewer pipeline. Configured agents independently review the target, " +
      "then cross-examine each other's findings. Returns all review rounds for synthesis. " +
      "Use this tool when the user runs /code-review, /plan-review, or /spec-review.",
    parameters: Type.Object({
      type: StringEnum(["code-review", "plan-review", "spec-review"] as const, {
        description: "The type of review to run",
      }),
      target: Type.String({
        description:
          "The review target — a PR URL, file paths, commit range, spec content, or description of what to review",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const prompts =
        params.type === "code-review"
          ? codeReviewPrompts
          : params.type === "plan-review"
            ? planReviewPrompts
            : specReviewPrompts;

      const config = await loadReviewConfig();
      const { runSubagent, cleanup } = createPiRunner(ctx.cwd, signal ?? undefined);

      try {
        const synthesis = await runReviewPipeline(
          runSubagent,
          params.target,
          prompts,
          config,
        );
        return {
          content: [{ type: "text", text: synthesis }],
          details: {},
        };
      } finally {
        cleanup();
      }
    },
  });
}
