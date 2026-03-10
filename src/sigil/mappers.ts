import type { AssistantMessage } from "@opencode-ai/sdk";
import type { GenerationResult } from "@grafana/sigil-sdk-js";

export type { GenerationResult };

export function mapGeneration(msg: AssistantMessage): GenerationResult {
  return {
    // v1: no content capture -- message.updated events don't carry parts
    output: [],
    usage: {
      inputTokens: msg.tokens.input,
      outputTokens: msg.tokens.output,
      reasoningTokens: msg.tokens.reasoning,
      cacheReadInputTokens: msg.tokens.cache.read,
      cacheWriteInputTokens: msg.tokens.cache.write,
    },
    responseModel: msg.modelID,
    stopReason: msg.finish,
    completedAt: msg.time.completed ? new Date(msg.time.completed) : undefined,
    metadata: {
      cost: msg.cost,
    },
  };
}

export function mapError(
  error: NonNullable<AssistantMessage["error"]>,
): Error {
  switch (error.name) {
    case "ProviderAuthError":
      return new Error(`provider_auth: ${error.data.message}`);
    case "APIError":
      return new Error(`api_error: ${error.data.statusCode ?? "unknown"} ${error.data.message}`);
    case "MessageOutputLengthError":
      return new Error("output_length_exceeded");
    case "MessageAbortedError":
      return new Error(`aborted: ${error.data.message}`);
    case "UnknownError":
      return new Error(`unknown: ${error.data.message}`);
    default: {
      const _exhaustive: never = error;
      return new Error("unknown");
    }
  }
}
