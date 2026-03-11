import { loadPluginConfig } from "../shared/config.js";
import type { ReviewConfig } from "../shared/config.js";

export type { ReviewConfig };

export async function loadReviewConfig(): Promise<ReviewConfig> {
  const config = await loadPluginConfig();
  return config.review;
}
