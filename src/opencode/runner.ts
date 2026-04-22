import type { createOpencodeClient, TextPart } from "@opencode-ai/sdk";
import type { RunSubagent, PhaseResult } from "../review/types.js";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

const RETRY_DELAY_MS = 5_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpencodeRunner(
  client: OpencodeClient,
  parentID: string,
): RunSubagent {
  return async (
    agent: string,
    title: string,
    prompt: string,
    timeoutMs: number,
  ): Promise<PhaseResult> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let sessionId: string | undefined;
      try {
        const session = await client.session.create({
          body: { parentID, title },
        });
        sessionId = session.data!.id;
        const result = await client.session.prompt({
          path: { id: sessionId },
          body: {
            agent,
            parts: [{ type: "text" as const, text: prompt }],
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = result.data!.parts
          .filter((p): p is TextPart => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        return { text };
      } catch (err) {
        const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
        const message = isTimeout
          ? `timed out after ${Math.round(timeoutMs / 1000)}s`
          : err instanceof Error ? err.message : String(err);

        // Best-effort abort so the session doesn't keep running in the background
        if (sessionId && isTimeout) {
          client.session.abort({ path: { id: sessionId } }).catch(() => {});
        }

        if (attempt === 0) {
          // Don't retry timeouts — if it timed out once, it'll likely time out again
          if (isTimeout) {
            console.warn(`[review] ${agent} ${message} — degrading gracefully`);
            return { text: "", error: message };
          }
          console.warn(`[review] ${agent} failed (${message}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        console.warn(`[review] ${agent} failed after retry: ${message} — degrading gracefully`);
        return { text: "", error: message };
      }
    }
    // unreachable, but satisfies TypeScript
    return { text: "", error: "unexpected" };
  };
}
