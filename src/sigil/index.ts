import type { SigilConfig } from "../shared/config.js";
import type { PluginInput } from "@opencode-ai/plugin";
import type { UserMessage, Part } from "@opencode-ai/sdk";
import { createSigilClient } from "./client.js";
import { handleEvent, handleLifecycle, handleChatMessage } from "./hooks.js";
import { Redactor } from "./redact.js";

export type { SigilConfig } from "../shared/config.js";

type OpencodeClient = PluginInput["client"];

export type SigilHooks = {
  event: (input: { event: { type: string; properties: unknown } }) => Promise<void>;
  chatMessage: (
    input: { sessionID: string },
    output: { message: UserMessage; parts: Part[] },
  ) => void;
};

export async function createSigilHooks(
  config: SigilConfig,
  client: OpencodeClient,
): Promise<SigilHooks | null> {
  if (!config.enabled) return null;

  if (!config.endpoint) {
    console.warn("[sigil] endpoint is required when enabled -- skipping Sigil initialization");
    return null;
  }

  const sigil = createSigilClient(config);
  if (!sigil) return null;

  const redactor = new Redactor();

  process.on("beforeExit", () => {
    sigil.shutdown().catch(() => {});
  });

  return {
    event: async (input) => {
      await handleEvent(sigil, config, client, redactor, input.event);
      await handleLifecycle(sigil, input.event);
    },
    chatMessage: (input, output) => {
      handleChatMessage(input, output);
    },
  };
}
