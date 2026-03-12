---
name: grafana
description: Query metrics, investigate alerts, analyze logs/traces, and interact with Grafana. Always try grafana-assistant CLI before falling back to Grafana MCP tools.
---

# Grafana

Use this skill when you need to query Grafana for metrics, logs, traces, alerts, or dashboards. The `grafana-assistant` CLI communicates with Grafana via the A2A protocol and returns structured JSON output suitable for further analysis.

## Priority

**Always try `grafana-assistant` first** before falling back to individual Grafana MCP tools (`mcp-grafana_*`). The assistant handles datasource routing, query construction, and context management automatically. Only use MCP tools directly when:

- `grafana-assistant` fails or returns an error
- You need a specific MCP-only operation (e.g., creating/updating dashboards, alert rules, or incidents)
- The user explicitly asks you to use a specific MCP tool

## Configured Instances

Discover available instances:

```bash
grafana-assistant config list
```

Authenticate: `grafana-assistant auth --instance <name>`
Switch default: `grafana-assistant config use-instance <name>`

Use `-i <instance>` to target a specific instance in queries.

## Default Context for This Project

Always include datasource in queries unless told otherwise. Include namespace when the targeted instance requires it (shared/ops instances typically do; personal instances typically do not). The correct values depend on which instance (`-i`) you are targeting.

- Run `grafana-assistant config list` to discover available instances
- Each instance has its own datasource names (check instance configuration for the correct prefix)
- Check your project's CLAUDE.md or configuration for instance-specific datasource and namespace mappings

## Querying

Always use `--json` for machine-readable output.

```bash
grafana-assistant prompt "your question" --json
grafana-assistant prompt "follow-up" --continue --json
```

### Flags

| Flag | Purpose |
|------|---------|
| `--json` | Structured JSON output (always use this) |
| `--continue` | Continue previous conversation |
| `--context <id>` | Resume a specific conversation by `contextId` |
| `--timeout <s>` | Increase timeout for complex queries (default 300) |
| `-i`, `--instance <name>` | Target a specific instance (see `grafana-assistant config list`) |

## Workflow

### 1. Always Specify Datasource and Namespace

Every query must name the datasource and namespace explicitly. Vague queries hit the wrong datasource.

```bash
# Good — specifies datasource, namespace, and instance
grafana-assistant prompt "Using <datasource>, show CPU usage for namespace <namespace> over the last hour" -i <instance> --json

# Good — personal instance where namespace is not needed
grafana-assistant prompt "Using <datasource>, show CPU usage over the last hour" -i <instance> --json

# Bad — missing datasource
grafana-assistant prompt "show CPU usage" --json
```

### 2. Always Specify Time Ranges

Never leave time ranges implicit. Use concrete ranges like "last 1h", "last 15m", "last 24h".

### 3. Managing Conversation Context

- Use `--continue` to build on the previous exchange without repeating context
- Drop `--continue` when switching to an unrelated topic — stale context confuses the assistant
- Use `--context <id>` to resume a specific prior conversation

### 4. Parse JSON Output

Without `--json`, output is plain text that is difficult to parse programmatically. Always pass `--json`.

Note: Panel references like `[panel:p1]` only render in the Grafana UI, not in CLI output — do not rely on them.

## Example Queries

### Instance-Specific Queries

```bash
# Alerts (include namespace if the instance requires it)
grafana-assistant prompt "List all firing alerts in namespace <namespace>" -i <instance> --json

# Metrics
grafana-assistant prompt "Using <datasource-prom>, show CPU usage for namespace <namespace> over the last hour" -i <instance> --json

# Logs
grafana-assistant prompt "Using <datasource-logs>, show error logs from namespace <namespace> in the last 15 minutes" -i <instance> --json

# Traces
grafana-assistant prompt "Using <datasource-traces>, find slow requests in namespace <namespace> over the last 30 minutes" -i <instance> --json
```

Replace `<instance>`, `<datasource-*>`, and `<namespace>` with values from your configured instance. Omit the namespace clause if the instance does not require one.

### General

```bash
# Dashboards
grafana-assistant prompt "Find dashboards related to application performance" --json

# Follow-up in same conversation
grafana-assistant prompt "Drill into the top error from that result" --continue --json
```

## Common Mistakes to Avoid

- **Missing datasource** — always include `"using <datasource>"` in the query
- **Missing namespace** — always include the namespace when the target instance requires it (shared/ops instances typically do; personal instances typically do not)
- **Wrong datasource prefix** — each instance has its own datasource naming convention; verify with `grafana-assistant config list`
- **Vague time ranges** — always say "last 1h", "last 15m", etc.
- **Long conversation chains** — drop `--continue` when switching topics
- **Forgetting `--json`** — always pass it for structured output

## Local Tool Access

```bash
grafana-assistant config add-project <project-name> <path>
grafana-assistant tunnel connect
```
