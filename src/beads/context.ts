import type { PluginInput } from "@opencode-ai/plugin";
import type { UserMessage, Part, TextPart, EventSessionCompacted } from "@opencode-ai/sdk";
import { BEADS_GUIDANCE } from "./vendor.js";

type OpencodeClient = PluginInput["client"];
type BunShell = PluginInput["$"];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getSessionContext(
  client: OpencodeClient,
  sessionID: string
): Promise<{ model?: { providerID: string; modelID: string }; agent?: string } | undefined> {
  try {
    const response = await client.session.messages({
      path: { id: sessionID },
      query: { limit: 50 },
    });
    if (response.data) {
      for (const msg of response.data) {
        if (msg.info.role === "user" && "model" in msg.info && msg.info.model) {
          return { model: msg.info.model, agent: msg.info.agent };
        }
      }
    }
  } catch {
    // On error, return undefined
  }
  return undefined;
}

async function tryAutoInit($: BunShell): Promise<boolean> {
  try {
    const result = await $`bd init --stealth --quiet`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Returns true if context was successfully injected (bd prime had output),
 * false if bd prime returned empty or failed.
 */
async function injectBeadsContext(
  client: OpencodeClient,
  $: BunShell,
  sessionID: string,
  context?: { model?: { providerID: string; modelID: string }; agent?: string }
): Promise<boolean> {
  try {
    const primeOutput = await $`bd prime`.text();
    if (!primeOutput || primeOutput.trim() === "") return false;
    const beadsContext = `<beads-context>\n${primeOutput.trim()}\n</beads-context>\n\n${BEADS_GUIDANCE}`;
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        model: context?.model,
        agent: context?.agent,
        parts: [{ type: "text", text: beadsContext, synthetic: true }],
      },
    });
    return true;
  } catch {
    // Silent skip
    return false;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBeadsContextManager(
  client: OpencodeClient,
  $: BunShell
): {
  handleChatMessage: (
    input: { sessionID: string },
    output: { message: UserMessage; parts: Part[] }
  ) => Promise<void>;
  handleCompactionEvent: (event: EventSessionCompacted) => Promise<void>;
} {
  const injectedSessions = new Set<string>();

  async function handleChatMessage(
    _input: { sessionID: string },
    output: { message: UserMessage; parts: Part[] }
  ): Promise<void> {
    const sessionID = output.message.sessionID;
    if (injectedSessions.has(sessionID)) return;

    try {
      const existing = await client.session.messages({ path: { id: sessionID }, query: { limit: 20 } });
      if (existing.data) {
        const hasBeadsContext = existing.data.some((msg) =>
          msg.parts.some(
            (part): part is TextPart =>
              part.type === "text" && (part as TextPart).text.includes("<beads-context>")
          )
        );
        if (hasBeadsContext) {
          injectedSessions.add(sessionID);
          return;
        }
      }
    } catch {
      // Ignore errors checking existing messages
    }

    injectedSessions.add(sessionID);

    const ctx = {
      model: output.message.model,
      agent: output.message.agent,
    };

    const injected = await injectBeadsContext(client, $, sessionID, ctx);
    if (!injected) {
      // bd prime returned empty — try auto-init then retry
      const initialized = await tryAutoInit($);
      if (initialized) {
        await injectBeadsContext(client, $, sessionID, ctx);
      }
    }
  }

  async function handleCompactionEvent(event: EventSessionCompacted): Promise<void> {
    const sessionID = event.properties.sessionID;
    const context = await getSessionContext(client, sessionID);
    await injectBeadsContext(client, $, sessionID, context);
  }

  return { handleChatMessage, handleCompactionEvent };
}
