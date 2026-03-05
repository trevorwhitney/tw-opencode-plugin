import type { Plugin } from "@opencode-ai/plugin";

// Patch: workmux's built-in plugin listens for the v1 SDK event name
// "permission.updated", but OpenCode >=1.x emits "permission.asked".
// This plugin fills that gap so `workmux set-window-status waiting`
// fires when OpenCode needs user input.

export const TwOpenCodePlugin: Plugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      const type = event.type as string;
      switch (type) {
        case "permission.asked":
        case "question.asked":
          await $`workmux set-window-status waiting`.quiet();
          break;
        case "permission.replied":
        case "question.replied":
          await $`workmux set-window-status working`.quiet();
          break;
      }
    },
  };
};
