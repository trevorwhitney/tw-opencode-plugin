import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export type ReviewConfig = {
  agents: string[];
};

export type PluginConfig = {
  review: ReviewConfig;
};

const CONFIG_PATH = join(homedir(), ".config", "opencode", "tw-plugin.json");

const REVIEW_DEFAULTS: ReviewConfig = {
  agents: ["critic-codex", "critic-opus", "critic-gemini"],
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
    return {
      review: { agents },
    };
  } catch {
    return { review: { ...REVIEW_DEFAULTS } };
  }
}
