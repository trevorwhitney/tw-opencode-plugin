import type { SigilConfig } from "../shared/config.js";
import { createSigilClient } from "./client.js";
import { handleEvent, handleLifecycle } from "./hooks.js";

export type { SigilConfig } from "../shared/config.js";

export type SigilHooks = {
  event: (input: { event: { type: string; properties: unknown } }) => Promise<void>;
};

export async function createSigilHooks(
  config: SigilConfig,
): Promise<SigilHooks | null> {
  if (!config.enabled) return null;

  // Validate required config
  if (!config.endpoint) {
    console.warn("[sigil] endpoint is required when enabled -- skipping Sigil initialization");
    return null;
  }

  const sigil = createSigilClient(config);
  if (!sigil) return null;

  // Safety net: ensure shutdown on process exit even if global.disposed
  // event is not received (it's an untyped runtime convention, not in the SDK Event union)
  process.on("beforeExit", () => {
    sigil.shutdown().catch(() => {});
  });

  return {
    event: async (input) => {
      await handleEvent(sigil, config, input.event);
      await handleLifecycle(sigil, input.event);
    },
  };
}
