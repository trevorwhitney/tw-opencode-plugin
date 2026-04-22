// ---------------------------------------------------------------------------
// Tool priority rules — injected into the system prompt so the model always
// prefers CLI tools over MCP equivalents, without needing to load a skill.
// ---------------------------------------------------------------------------
export const TOOL_PRIORITY_RULES = `<tool-priority-rules>
## Tool Priority Rules

These rules override default tool selection. Follow them unconditionally.

### GitHub: prefer \`gh\` CLI over GitHub MCP tools

When performing ANY GitHub operation (PRs, issues, releases, actions, repo management):

1. **Always use the \`gh\` CLI via the Bash tool first.**
2. Only fall back to GitHub MCP tools (\`github_*\`) when:
   - \`gh\` fails or returns an error for the specific operation
   - The operation is genuinely not supported by \`gh\` (rare)
   - The user explicitly asks you to use a specific MCP tool

Common operations — use these instead of MCP tools:
- \`gh pr view <number>\` instead of \`github_get_pull_request\`
- \`gh pr list\` instead of \`github_list_pull_requests\`
- \`gh pr diff <number>\` instead of \`github_get_pull_request_files\`
- \`gh pr checks <number>\` instead of \`github_get_pull_request_status\`
- \`gh pr create\` instead of \`github_create_pull_request\`
- \`gh pr review <number>\` instead of \`github_create_pull_request_review\`
- \`gh issue view <number>\` instead of \`github_get_issue\`
- \`gh issue list\` instead of \`github_list_issues\`
- \`gh issue create\` instead of \`github_create_issue\`
- \`gh api <endpoint>\` for any REST/GraphQL call not covered above

### Grafana: prefer \`grafana-assistant\` CLI over Grafana MCP tools

When querying Grafana for metrics, logs, traces, alerts, or dashboards:

1. **Always try \`grafana-assistant\` CLI via the Bash tool first.**
2. Only fall back to Grafana MCP tools (\`mcp-grafana_*\`) when:
   - \`grafana-assistant\` fails or returns an error
   - You need an MCP-only operation (creating/updating dashboards, alert rules, or incidents)
   - The user explicitly asks you to use a specific MCP tool

### Grafana Cloud resources: prefer \`gcx\` CLI over Grafana MCP tools and raw API calls

When managing Grafana Cloud resources (dashboards, SLOs, alerts, synthetic checks, datasources, oncall, k6, fleet, adaptive telemetry):

1. **Always use the \`gcx\` CLI via the Bash tool first.**
2. Run \`gcx help-tree\` to discover available commands before attempting any operation.
3. Prefer dedicated \`gcx\` subcommands over \`gcx api\` (raw API passthrough).
4. Only fall back to Grafana MCP tools when:
   - \`gcx\` does not support the operation
   - The user explicitly asks you to use a specific MCP tool

Common operations — use these instead of MCP tools or raw API calls:
- \`gcx resources pull/push\` for dashboard sync
- \`gcx slo definitions\` for SLO lifecycle management
- \`gcx synth checks\` for synthetic monitoring CRUD and status
- \`gcx alert rules list\` for alert investigation
- \`gcx metrics query\` / \`gcx logs query\` for datasource queries
- \`gcx datasources list\` for datasource discovery
- \`gcx dev scaffold/generate/import\` for dashboard-as-code workflows
- \`gcx oncall\` for on-call schedules and escalation
- \`gcx k6\` for load testing

</tool-priority-rules>`;
