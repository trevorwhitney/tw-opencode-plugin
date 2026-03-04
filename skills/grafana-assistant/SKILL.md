---
name: grafana-assistant
description: Query metrics, investigate alerts, analyze logs/traces, and interact with Grafana from the terminal via the grafana-assistant CLI.
---

# Grafana Assistant

Use this skill when you need to query Grafana for metrics, logs, traces, alerts, or dashboards. The `grafana-assistant` CLI communicates with Grafana via the A2A protocol and returns structured JSON output suitable for further analysis.

## Configured Instances

| Instance | URL |
|----------|-----|
| `ops` | https://ops.grafana-ops.net |
| `twhitney` | *(personal instance)* |

If not yet authenticated: `grafana-assistant auth --instance <name>`
Switch instance: `grafana-assistant config use-instance <name>`
List instances: `grafana-assistant config list`

## Default Context for This Project

Always include these in queries unless told otherwise. The correct datasources and namespace depend on which instance (`-i`) is being used:

### Instance: `ops` (`-i ops`)

- **Datasources**: `grafanacloud-ops-logs`, `grafanacloud-ops-traces`, `grafanacloud-ops-prom`, `grafanacloud-ops-profiles`
- **Namespace**: `loki-ops-002`

### Instance: `twhitney` (`-i twhitney`)

- **Datasources**: `grafanacloud-logs`, `grafanacloud-traces`, `grafanacloud-prom`, `grafanacloud-profiles`
- **Namespace**: *(none — do not include a namespace filter)*

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
| `-i`, `--instance <name>` | Target a specific instance (`ops` or `twhitney`) |

## Workflow

### 1. Always Specify Datasource and Namespace

Every query must name the datasource and namespace explicitly. Vague queries hit the wrong datasource.

```bash
# Good — ops instance
grafana-assistant prompt "Using grafanacloud-ops-prom, show CPU usage for namespace loki-ops-002 over the last hour" -i ops --json

# Good — twhitney instance (no namespace needed)
grafana-assistant prompt "Using grafanacloud-prom, show CPU usage over the last hour" -i twhitney --json

# Bad - missing datasource
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

### Using `-i ops`

```bash
# Alerts
grafana-assistant prompt "List all firing alerts in namespace loki-ops-002" -i ops --json

# Metrics
grafana-assistant prompt "Using grafanacloud-ops-prom, show CPU usage for namespace loki-ops-002 over the last hour" -i ops --json

# Logs
grafana-assistant prompt "Using grafanacloud-ops-logs, show error logs from namespace loki-ops-002 in the last 15 minutes" -i ops --json

# Traces
grafana-assistant prompt "Using grafanacloud-ops-traces, find slow requests in namespace loki-ops-002 over the last 30 minutes" -i ops --json
```

### Using `-i twhitney`

```bash
# Metrics
grafana-assistant prompt "Using grafanacloud-prom, show CPU usage over the last hour" -i twhitney --json

# Logs
grafana-assistant prompt "Using grafanacloud-logs, show error logs in the last 15 minutes" -i twhitney --json

# Traces
grafana-assistant prompt "Using grafanacloud-traces, find slow requests over the last 30 minutes" -i twhitney --json
```

### General

```bash
# Dashboards
grafana-assistant prompt "Find dashboards related to application performance" --json

# Follow-up in same conversation
grafana-assistant prompt "Drill into the top error from that result" --continue --json
```

## Common Mistakes to Avoid

- **Missing datasource** — always include `"using <datasource>"` in the query
- **Missing namespace** — always include `"for namespace loki-ops-002"` when using `-i ops`; do **not** add a namespace when using `-i twhitney`
- **Wrong datasource prefix** — use `grafanacloud-ops-*` for `-i ops` and `grafanacloud-*` (without `ops`) for `-i twhitney`
- **Vague time ranges** — always say "last 1h", "last 15m", etc.
- **Long conversation chains** — drop `--continue` when switching topics
- **Forgetting `--json`** — always pass it for structured output

## Local Tool Access

```bash
grafana-assistant config add-project <project-name> <path>
grafana-assistant tunnel connect
```
