export { loadCommands, loadAgent } from "./vendor.js";
export { createBeadsContextManager } from "./context.js";

export const BEADS_AWARENESS = `<beads-task-tracking>
## Task Tracking (beads)

This environment has beads (bd) available for task tracking. Use the bash tool
to run bd commands with --json for structured output. For multi-step beads work
(status overviews, working through issues), delegate to the beads-task-agent
subagent. Beads defaults to stealth mode (local-only, no git commits).
</beads-task-tracking>`;
