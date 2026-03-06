import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { ReviewConfig } from "./types.js";

const CONFIG_PATH = join(homedir(), ".config", "opencode", "tw-plugin.json");

const DEFAULTS: ReviewConfig = {
  agentA: "critic-codex",
  agentB: "critic-opus",
};

export async function loadReviewConfig(): Promise<ReviewConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      agentA: parsed?.review?.agentA ?? DEFAULTS.agentA,
      agentB: parsed?.review?.agentB ?? DEFAULTS.agentB,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
