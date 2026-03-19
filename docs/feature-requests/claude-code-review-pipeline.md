# Feature Request: Claude Code Review Pipeline via Agent Swarms

**Status:** Parked — blocked on Claude Code model limitations
**Date:** 2026-03-19

## Goal

Create a Claude Code equivalent of the existing OpenCode multi-reviewer pipeline (`review-pipeline` tool) that uses Claude Code's native Task/Agent tool to dispatch parallel reviewer subagents, achieving the same round 1 (independent review) -> round 2 (cross-examination) -> synthesis flow.

## Why it matters

The existing OpenCode pipeline dispatches 3 different LLMs (Opus, Gemini, Codex) to independently review code/plans/specs, then cross-examine each other's findings. The cross-vendor model diversity is the primary value — different LLMs catch genuinely different classes of issues.

## Proposed design

- **Approach:** Self-contained slash commands in a new `claude-commands/` directory, deployed to `~/.claude/commands/`. Each command (code-review, plan-review, spec-review) contains full orchestration instructions telling Claude to use the Task tool to dispatch parallel critic subagents.
- **Agents:** 3 critic subagents defined in `~/.claude/agents/` or as Claude Code plugin agents, each with a different model.
- **Deploy:** New section in `scripts/deploy.sh` copying `claude-commands/*.md` to `~/.claude/commands/`.
- **Isolation:** OpenCode does NOT read from `~/.claude/commands/` (confirmed — see issues [#6985](https://github.com/anomalyco/opencode/issues/6985) and [#10262](https://github.com/anomalyco/opencode/issues/10262)), so no cross-contamination risk.

## Blocking issue

**Claude Code agents only support Anthropic models.** The `model` field in Claude Code agent definitions accepts `sonnet`, `opus`, `haiku`, or full Anthropic model IDs (e.g., `claude-opus-4-6`). There is no support for non-Anthropic models like Google Gemini or OpenAI Codex.

This means the pipeline would be limited to 3 flavors of Claude (opus/sonnet/haiku) instead of 3 genuinely different LLMs. The cross-vendor diversity — where different model architectures and training approaches surface different categories of issues — is the core value proposition of the multi-reviewer pattern. Without it, the feature isn't worth building.

Source: [Claude Code subagent docs](https://docs.anthropic.com/en/docs/claude-code/sub-agents) — "Choose a model" section.

## What would unblock this

- Claude Code adding support for non-Anthropic models in agent definitions (Google Gemini, OpenAI models, etc.)
- An alternative mechanism to dispatch to non-Anthropic models from within Claude Code (e.g., MCP server proxying to other providers)

## Related context

- Existing pipeline: `src/review/pipeline.ts` — orchestrates via OpenCode SDK `session.create`/`session.prompt`
- Critic agents: `agents/critic-opus.md`, `agents/critic-gemini.md`, `agents/critic-codex.md`
- Review prompts: `src/review/prompts/` — code-review, plan-review, spec-review
- OpenCode issues watched: [#6985](https://github.com/anomalyco/opencode/issues/6985) (`.claude/commands/` compat), [#10262](https://github.com/anomalyco/opencode/issues/10262) (plugin dynamic commands)
