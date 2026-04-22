import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export type ReviewConfig = {
  agents: string[];
  /** Per-agent timeout in milliseconds. Default: 300_000 (5 minutes). */
  timeoutMs: number;
};

export type PluginConfig = {
  review: ReviewConfig;
};

const CONFIG_PATH = join(homedir(), ".config", "tw-plugin.json");

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

const REVIEW_DEFAULTS: ReviewConfig = {
  agents: ["critic-codex", "critic-opus", "critic-sonnet"],
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

export async function loadPluginConfig(): Promise<PluginConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const review = parsed?.review;
    let agents: string[];
    if (Array.isArray(review?.agents) && review.agents.length > 0) {
      // New format: { agents: ["critic-codex", "critic-opus", "critic-gemini"] }
      agents = review.agents;
    } else if (review?.agentA || review?.agentB) {
      // Legacy format: { agentA: "critic-codex", agentB: "critic-opus" }
      agents = [
        review.agentA ?? REVIEW_DEFAULTS.agents[0],
        review.agentB ?? REVIEW_DEFAULTS.agents[1],
      ];
    } else {
      agents = [...REVIEW_DEFAULTS.agents];
    }
    const timeoutMs =
      typeof review?.timeoutMs === "number" && review.timeoutMs > 0
        ? review.timeoutMs
        : DEFAULT_TIMEOUT_MS;

    return {
      review: { agents, timeoutMs },
    };
  } catch {
    return { review: { ...REVIEW_DEFAULTS, timeoutMs: DEFAULT_TIMEOUT_MS } };
  }
}
