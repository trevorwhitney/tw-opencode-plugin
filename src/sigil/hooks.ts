import type { SigilClient } from "@grafana/sigil-sdk-js";
import type { AssistantMessage } from "@opencode-ai/sdk";
import type { SigilConfig } from "../shared/config.js";
import { mapGeneration, mapError } from "./mappers.js";
import { Redactor } from "./redact.js";

// Shared redactor instance for this module
const redactor = new Redactor();

// Track recorded messages per session for dedup and cleanup
const recordedMessages = new Map<string, Set<string>>();

function buildAgentName(prefix: string | undefined, mode: string | undefined): string {
  const base = prefix || "opencode";
  return mode ? `${base}:${mode}` : base;
}

export async function handleEvent(
  sigil: SigilClient,
  config: SigilConfig,
  event: { type: string; properties: unknown },
): Promise<void> {
  if (event.type !== "message.updated") return;

  const properties = event.properties as { info?: { role?: string } } | undefined;
  const msg = properties?.info;
  if (!msg || msg.role !== "assistant") return;

  const assistantMsg = msg as AssistantMessage;

  // Only record terminal messages (has finish reason, error, or completed timestamp)
  const isTerminal = assistantMsg.finish || assistantMsg.error || assistantMsg.time.completed;
  if (!isTerminal) return;

  // Dedup: skip if already recorded
  const sessionSet = recordedMessages.get(assistantMsg.sessionID) ?? new Set<string>();
  if (sessionSet.has(assistantMsg.id)) return;
  sessionSet.add(assistantMsg.id);
  recordedMessages.set(assistantMsg.sessionID, sessionSet);

  try {
    await sigil.startGeneration(
      {
        conversationId: assistantMsg.sessionID,
        agentName: buildAgentName(config.agentName, assistantMsg.mode),
        agentVersion: config.agentVersion,
        model: { provider: assistantMsg.providerID, name: assistantMsg.modelID },
        startedAt: new Date(assistantMsg.time.created),
      },
      async (recorder) => {
        if (assistantMsg.error) {
          recorder.setCallError(mapError(assistantMsg.error));
        } else {
          // v1: no content capture — message.updated events don't carry parts
          recorder.setResult(mapGeneration(assistantMsg, [], [], redactor));
        }
      },
    );
  } catch {
    // Sigil recording failure should never break the plugin
  }
}

export async function handleLifecycle(
  sigil: SigilClient,
  event: { type: string; properties: unknown },
): Promise<void> {
  const type = event.type as string;

  if (type === "session.idle") {
    try {
      await sigil.flush();
    } catch {
      // flush failure is non-fatal
    }
  }

  if (type === "session.deleted") {
    const properties = event.properties as { info?: { id?: string } } | undefined;
    const sessionId = properties?.info?.id;
    if (sessionId) {
      recordedMessages.delete(sessionId);
    }
  }

  if (type === "global.disposed") {
    try {
      await sigil.shutdown();
    } catch {
      // shutdown failure is non-fatal
    }
  }
}
