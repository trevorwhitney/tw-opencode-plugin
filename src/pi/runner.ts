import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RunSubagent, PhaseResult } from "../review/types.js";

/** Map critic agent names to model IDs. Unknown names used as-is (raw model ID fallback). */
const CRITIC_MODELS: Record<string, string> = {
  "critic-codex": "openai/gpt-5.3-codex",
  "critic-opus": "anthropic/claude-opus-4-6",
  "critic-sonnet": "anthropic/claude-sonnet-4-6",
  "critic-gemini": "google/gemini-2.5-pro",
};

/** Shared system prompt for all critic agents. */
const CRITIC_SYSTEM_PROMPT = `You are a senior software engineer participating in a constructive
technical debate. You have strong opinions backed by experience, but
you change your mind when presented with better evidence.

## How you work

- Read the actual source code before making claims. Use file paths
  and line numbers for every finding.
- Run bash commands to gather context: \`cat\` files, \`git diff\`, \`git log\`.
- Evaluate severity honestly. Not everything is critical.
- Apply YAGNI and prefer simplicity.
- Distinguish between "this is wrong" and "I'd do it differently."
  Only the former is a real finding.

## How you debate

- Be direct and concise. State your position, then support it.
- When challenged, respond with evidence — not repetition.
- Concede when you're wrong. Defending a weak position wastes
  everyone's time.
- Look for what others missed, not just what they got wrong.
- A debate where both sides improve the outcome is a success.

Follow the instructions given to you in each round precisely.`;

const CRITIC_TOOLS = "read,grep,find,ls,bash";
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve how to invoke pi. Uses the same heuristic as
 * pi's subagent example extension.
 */
function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }
  return { command: "pi", args };
}

/**
 * Write the critic system prompt to a temp file.
 * Returns the temp dir and file path for cleanup.
 */
async function writeTempSystemPrompt(): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-review-"));
  const filePath = path.join(tmpDir, "critic-system-prompt.md");
  await fs.promises.writeFile(filePath, CRITIC_SYSTEM_PROMPT, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

/**
 * Spawn a single pi subprocess for a critic agent and collect the final assistant text.
 */
async function spawnCritic(
  cwd: string,
  model: string,
  systemPromptPath: string,
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<PhaseResult> {
  const piArgs = [
    "--mode", "json",
    "-p",
    "--no-session",
    "--model", model,
    "--tools", CRITIC_TOOLS,
    "--append-system-prompt", systemPromptPath,
    prompt,
  ];

  return new Promise<PhaseResult>((resolve) => {
    const invocation = getPiInvocation(piArgs);
    const proc = spawn(invocation.command, invocation.args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";
    let stderr = "";
    let assistantText = "";
    let wasAborted = false;

    const timeoutHandle = setTimeout(() => {
      wasAborted = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5_000);
    }, timeoutMs);

    const abortHandler = () => {
      wasAborted = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5_000);
    };

    if (signal) {
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === "message_end" && event.message?.role === "assistant") {
        for (const part of event.message.content ?? []) {
          if (part.type === "text") {
            assistantText += (assistantText ? "\n" : "") + part.text;
          }
        }
      }
    };

    proc.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (buffer.trim()) processLine(buffer);

      if (wasAborted && !assistantText) {
        resolve({ text: "", error: `timed out after ${Math.round(timeoutMs / 1000)}s` });
      } else if (code !== 0 && !assistantText) {
        resolve({ text: "", error: stderr.trim() || `exit code ${code}` });
      } else {
        resolve({ text: assistantText });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", abortHandler);
      resolve({ text: "", error: err.message });
    });
  });
}

/**
 * Create a RunSubagent function that spawns pi subprocesses.
 * Call cleanup() when the pipeline run is complete to remove the temp system prompt file.
 */
export function createPiRunner(
  cwd: string,
  signal?: AbortSignal,
): { runSubagent: RunSubagent; cleanup: () => void } {
  let tempDir: string | null = null;
  let tempFile: string | null = null;

  const runSubagent: RunSubagent = async (
    agent: string,
    _title: string,
    prompt: string,
    timeoutMs: number,
  ): Promise<PhaseResult> => {
    // Lazy-init temp system prompt file on first call
    if (!tempFile) {
      const tmp = await writeTempSystemPrompt();
      tempDir = tmp.dir;
      tempFile = tmp.filePath;
    }

    const model = CRITIC_MODELS[agent] ?? agent;

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await spawnCritic(cwd, model, tempFile, prompt, timeoutMs, signal);

      if (result.error) {
        const isTimeout = result.error.startsWith("timed out");
        if (attempt === 0) {
          if (isTimeout) {
            console.warn(`[review] ${agent} ${result.error} — degrading gracefully`);
            return result;
          }
          console.warn(`[review] ${agent} failed (${result.error}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        console.warn(`[review] ${agent} failed after retry: ${result.error} — degrading gracefully`);
        return result;
      }

      return result;
    }

    return { text: "", error: "unexpected" };
  };

  const cleanup = () => {
    if (tempFile) try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
    if (tempDir) try { fs.rmdirSync(tempDir); } catch { /* ignore */ }
  };

  return { runSubagent, cleanup };
}
