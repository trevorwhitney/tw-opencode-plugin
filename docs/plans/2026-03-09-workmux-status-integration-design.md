# Workmux Integration Design

**Goal:** Fully integrate workmux into tw-opencode-plugin: (1) replace the standalone `workmux-status.ts` plugin with integrated status handling including clear-on-new-session and clear-on-exit, and (2) vendor the 5 workmux skills as plugin-registered commands under the `workmux:` prefix, eliminating the dependency on cloning the workmux repo for skills.

## Current State

Three pieces handle workmux integration, all depending on cloning the upstream repo:

1. **`workmux-status.ts`** (upstream plugin, symlinked via deploy.sh) — maps OpenCode events to `workmux set-window-status` calls
2. **`tw-opencode-plugin` event handler** (src/index.ts:79-93) — partial duplicate of the above (permission/question events only)
3. **5 workmux skills** (copied from upstream repo to `~/.config/opencode/skills/workmux/`) + 5 command wrappers in `commands/` that invoke them via the Skill tool

## Design

### Part 1: Status Handling

Inline the complete workmux status logic into the existing event handler in `src/index.ts`.

**Event → Status Mapping:**

| Event | workmux status | Icon | Behavior |
|---|---|---|---|
| `session.status` (busy) | `working` | 🤖 | Model is actively processing |
| `permission.asked` | `waiting` | 💬 | Needs tool approval |
| `question.asked` | `waiting` | 💬 | Asked user a question |
| `session.idle` | `done` | ✅ | Model finished, user's turn |
| `session.created` | `clear` | (none) | New session started, reset icon |
| `global.disposed` | `clear` | (none) | OpenCode is exiting, reset icon |

**Dropped from upstream:** `permission.replied`/`question.replied` → working. The model immediately goes idle after a reply, so this transition flashes invisibly.

**Added `.nothrow()`:** All workmux CLI calls use `.quiet().nothrow()` so the plugin doesn't crash when workmux isn't installed.

### Part 2: Vendored Commands

Copy the 5 workmux SKILL.md files into `src/workmux/vendor/commands/`, following the same pattern as `src/beads/vendor/commands/`. A `loadCommands()` function parses the frontmatter and registers them as plugin commands under the `workmux:` prefix.

**Mapping from skill frontmatter → command registration:**

| Skill frontmatter field | Command registration field |
|---|---|
| `description` | `description` |
| body content | `template` |
| filename (minus `.md`) | command name with `workmux:` prefix |

The `name`, `disable-model-invocation`, and `allowed-tools` frontmatter fields are skill-specific and not used in command registration.

**Commands registered:** `workmux:coordinator`, `workmux:merge`, `workmux:open-pr`, `workmux:rebase`, `workmux:worktree`

### Part 3: Deploy Script Cleanup

- Remove workmux repo clone/pull entirely (no longer needed)
- Remove workmux plugin symlink
- Remove workmux skills copy
- Add cleanup for stale `workmux-status.ts` symlink
- Remove the 5 command wrapper files from `commands/` (replaced by plugin-registered commands)

### Error Handling

All `workmux set-window-status` calls use `.quiet().nothrow()` to silently swallow errors — workmux may not be installed in all environments.

## What Stays the Same

- Beads integration, review pipeline, system prompt injection
- The `workmux` CLI itself (installed separately, not part of this plugin)
