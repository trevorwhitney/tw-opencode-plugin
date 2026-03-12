#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
OPENCODE_DIR="${HOME}/.config/opencode"
SKILLS_TARGET="${OPENCODE_DIR}/skills"
COMMANDS_TARGET="${OPENCODE_DIR}/command"

echo "Deploying tw-opencode-plugin..."
echo "  Source: ${PLUGIN_DIR}"
echo "  Target: ${OPENCODE_DIR}"

link_item() {
	local source="$1"
	local target="$2"
	local name="$3"

	if [ -L "$target" ]; then
		existing="$(readlink "$target")"
		if [ "$existing" = "$source" ] || [ "$existing" = "${source%/}" ]; then
			echo "  [skip] ${name} (already linked)"
			return
		fi
		echo "  [update] ${name} (relink)"
		rm "$target"
	elif [ -e "$target" ]; then
		echo "  [backup] ${name} -> ${target}.bak"
		mv "$target" "${target}.bak"
	fi

	ln -s "${source%/}" "$target"
	echo "  [link] ${name}"
}

# Copy a file to the target, replacing symlinks or existing files.
# Used instead of link_item for commands, agents, and skills because
# Bun.Glob.scan() (used by subtask2) does not follow symlinks.
copy_item() {
	local source="$1"
	local target="$2"
	local name="$3"

	# Remove existing symlink first (leftover from previous link-based deploy)
	if [ -L "$target" ]; then
		rm "$target"
	fi

	if [ -f "$target" ] && cmp -s "$source" "$target"; then
		echo "  [skip] ${name} (unchanged)"
		return
	fi

	cp "$source" "$target"
	echo "  [copy] ${name}"
}

# Recursively copy a directory, replacing symlinks or existing directories.
copy_dir() {
	local source="$1"
	local target="$2"
	local name="$3"

	# Remove existing symlink first (leftover from previous link-based deploy)
	if [ -L "$target" ]; then
		rm "$target"
	fi

	# rsync with checksum so unchanged files are skipped
	if command -v rsync &>/dev/null; then
		rsync -rc --delete "${source%/}/" "${target%/}/"
	else
		rm -rf "$target"
		cp -R "${source%/}" "$target"
	fi
	echo "  [copy] ${name}"
}

echo ""
echo "Skills:"
mkdir -p "$SKILLS_TARGET"
for skill_dir in "${PLUGIN_DIR}/skills"/*/; do
	skill_name="$(basename "$skill_dir")"
	copy_dir "$skill_dir" "${SKILLS_TARGET}/${skill_name}" "$skill_name"
done

echo ""
echo "Commands:"
mkdir -p "$COMMANDS_TARGET"
for cmd_file in "${PLUGIN_DIR}/commands"/*.md; do
	[ -f "$cmd_file" ] || continue
	cmd_name="$(basename "$cmd_file")"
	copy_item "$cmd_file" "${COMMANDS_TARGET}/${cmd_name}" "$cmd_name"
done

echo ""
echo "Agents:"
AGENTS_TARGET="${OPENCODE_DIR}/agents"
mkdir -p "$AGENTS_TARGET"
for agent_file in "${PLUGIN_DIR}/agents"/*.md; do
	[ -f "$agent_file" ] || continue
	agent_name="$(basename "$agent_file")"
	copy_item "$agent_file" "${AGENTS_TARGET}/${agent_name}" "$agent_name"
done

# ── Plugin (built JS) ─────────────────────────────────────────
PLUGINS_TARGET="${OPENCODE_DIR}/plugins"
mkdir -p "$PLUGINS_TARGET"

echo ""
echo "Plugin:"
link_item "${PLUGIN_DIR}/dist/index.js" \
	"${PLUGINS_TARGET}/tw-opencode-plugin.js" \
	"tw-opencode-plugin"

# ── Superpowers ───────────────────────────────────────────────
SUPERPOWERS_DIR="${OPENCODE_DIR}/superpowers"
SUPERPOWERS_REPO="https://github.com/trevorwhitney/superpowers.git"

echo ""
echo "Superpowers:"

if [ -d "$SUPERPOWERS_DIR/.git" ]; then
	# Ensure we're pointed at the right remote (handles switch from upstream to fork)
	current_remote="$(git -C "$SUPERPOWERS_DIR" remote get-url origin 2>/dev/null || true)"
	if [ "$current_remote" != "$SUPERPOWERS_REPO" ]; then
		echo "  [update] switching superpowers remote to ${SUPERPOWERS_REPO}"
		git -C "$SUPERPOWERS_DIR" remote set-url origin "$SUPERPOWERS_REPO"
	fi
	echo "  [update] pulling latest superpowers..."
	git -C "$SUPERPOWERS_DIR" pull --ff-only --quiet
else
	if [ -e "$SUPERPOWERS_DIR" ]; then
		echo "  [backup] ${SUPERPOWERS_DIR} -> ${SUPERPOWERS_DIR}.bak"
		mv "$SUPERPOWERS_DIR" "${SUPERPOWERS_DIR}.bak"
	fi
	echo "  [clone] cloning superpowers..."
	git clone --quiet "$SUPERPOWERS_REPO" "$SUPERPOWERS_DIR"
fi

# Register the superpowers plugin
link_item "${SUPERPOWERS_DIR}/.opencode/plugins/superpowers.js" \
	"${PLUGINS_TARGET}/superpowers.js" \
	"superpowers plugin"

# Copy superpowers skills
if [ -L "${SKILLS_TARGET}/superpowers" ]; then
	echo "  [migrate] removing old superpowers directory symlink"
	rm "${SKILLS_TARGET}/superpowers"
fi
mkdir -p "${SKILLS_TARGET}/superpowers"

for sp_skill_dir in "${SUPERPOWERS_DIR}/skills"/*/; do
	[ -d "$sp_skill_dir" ] || continue
	sp_skill_name="$(basename "$sp_skill_dir")"
	copy_dir "$sp_skill_dir" "${SKILLS_TARGET}/superpowers/${sp_skill_name}" "superpowers/${sp_skill_name}"
done

# Clean up stale plugin skill overrides (these now come from superpowers fork)
for stale_skill in writing-plans subagent-driven-development; do
	if [ -d "${SKILLS_TARGET}/${stale_skill}" ]; then
		echo "  [remove] stale plugin skill override: ${stale_skill}"
		rm -rf "${SKILLS_TARGET}/${stale_skill}"
	fi
done

# Copy superpowers commands
for cmd_file in "${SUPERPOWERS_DIR}/commands"/*.md; do
	[ -f "$cmd_file" ] || continue
	cmd_name="$(basename "$cmd_file")"
	copy_item "$cmd_file" "${COMMANDS_TARGET}/${cmd_name}" "superpowers: ${cmd_name}"
done

# ── Workmux (legacy cleanup) ─────────────────────────────────
# Workmux status and commands are now integrated into tw-opencode-plugin.
# Clean up artifacts from the previous deploy approach.
if [ -L "${PLUGINS_TARGET}/workmux-status.ts" ]; then
	echo "  [remove] legacy workmux-status.ts plugin"
	rm "${PLUGINS_TARGET}/workmux-status.ts"
fi
if [ -d "${SKILLS_TARGET}/workmux" ]; then
	echo "  [remove] legacy workmux skills directory"
	rm -rf "${SKILLS_TARGET}/workmux"
fi
for cmd in coordinator merge open-pr rebase worktree; do
	if [ -f "${COMMANDS_TARGET}/${cmd}.md" ]; then
		echo "  [remove] legacy workmux command: ${cmd}.md"
		rm "${COMMANDS_TARGET}/${cmd}.md"
	fi
done

# ── Cleanup stale symlinks ────────────────────────────────────
echo ""
echo "Cleanup:"
for dir in "$COMMANDS_TARGET" "$SKILLS_TARGET" "${SKILLS_TARGET}/superpowers" "$AGENTS_TARGET" "$PLUGINS_TARGET"; do
	[ -d "$dir" ] || continue
	for entry in "$dir"/*; do
		[ -L "$entry" ] || continue
		if [ ! -e "$entry" ]; then
			echo "  [remove] stale symlink: $(basename "$entry")"
			rm "$entry"
		fi
	done
done

# ── Claude Code Plugin ────────────────────────────────────────
CLAUDE_PLUGINS_DIR="${HOME}/.claude/plugins"
CLAUDE_PLUGINS_JSON="${CLAUDE_PLUGINS_DIR}/installed_plugins.json"
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

echo ""
echo "Claude Code:"
mkdir -p "$CLAUDE_PLUGINS_DIR"

if [ ! -f "$CLAUDE_PLUGINS_JSON" ]; then
    echo '{"version": 2, "plugins": {}}' > "$CLAUDE_PLUGINS_JSON"
    echo "  [create] installed_plugins.json"
fi

if command -v jq &>/dev/null; then
    TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
    PLUGIN_VERSION="$(jq -r '.version // "0.1.0"' "${PLUGIN_DIR}/.claude-plugin/plugin.json")"

    jq --arg path "$PLUGIN_DIR" \
       --arg version "$PLUGIN_VERSION" \
       --arg ts "$TIMESTAMP" \
       '.plugins.tw = [{
         "scope": "user",
         "installPath": $path,
         "version": $version,
         "installedAt": $ts,
         "lastUpdated": $ts
       }]' "$CLAUDE_PLUGINS_JSON" > "${CLAUDE_PLUGINS_JSON}.tmp" \
    && mv "${CLAUDE_PLUGINS_JSON}.tmp" "$CLAUDE_PLUGINS_JSON"
    echo "  [register] tw plugin (${PLUGIN_DIR})"

    # Enable the plugin in Claude Code settings
    if [ -f "$CLAUDE_SETTINGS" ]; then
        if ! jq -e '.enabledPlugins.tw // false' "$CLAUDE_SETTINGS" >/dev/null 2>&1; then
            jq '.enabledPlugins.tw = true' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp" \
            && mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
            echo "  [enable] tw in settings.json"
        else
            echo "  [skip] tw already enabled in settings.json"
        fi
    fi
else
    echo "  [skip] jq not found, cannot register Claude Code plugin"
fi

echo ""
echo "Done. Restart OpenCode and/or Claude Code to pick up changes."
