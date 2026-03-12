import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export type SigilAuthConfig =
  | { mode: "bearer"; bearerToken: string }
  | { mode: "tenant"; tenantId: string }
  | { mode: "basic"; tenantId: string; token: string }
  | { mode: "none" };

export type SigilConfig = {
  enabled: boolean;
  endpoint: string;
  auth: SigilAuthConfig;
  agentName?: string;
  agentVersion?: string;
  contentCapture?: boolean; // default: true
};

export type ReviewConfig = {
  agents: string[];
};

export type PluginConfig = {
  review: ReviewConfig;
  sigil?: SigilConfig;
};

const CONFIG_PATH = join(homedir(), ".config", "opencode", "tw-plugin.json");

const REVIEW_DEFAULTS: ReviewConfig = {
  agents: ["critic-codex", "critic-opus", "critic-gemini"],
};

export function parseSigilConfig(raw: unknown): SigilConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.enabled !== true) return undefined;
  if (typeof obj.endpoint !== "string" || !obj.endpoint) {
    console.warn("[sigil] enabled but endpoint is missing or not a string -- disabling");
    return undefined;
  }
  if (!obj.auth || typeof obj.auth !== "object") {
    console.warn("[sigil] enabled but auth config is missing -- disabling");
    return undefined;
  }
  return raw as SigilConfig;
}

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
      sigil: parseSigilConfig(parsed?.sigil),
    };
  } catch {
    return { review: { ...REVIEW_DEFAULTS } };
  }
}
