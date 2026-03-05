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

echo ""
echo "Skills:"
mkdir -p "$SKILLS_TARGET"
for skill_dir in "${PLUGIN_DIR}/skills"/*/; do
	skill_name="$(basename "$skill_dir")"
	link_item "$skill_dir" "${SKILLS_TARGET}/${skill_name}" "$skill_name"
done

echo ""
echo "Commands:"
mkdir -p "$COMMANDS_TARGET"
for cmd_file in "${PLUGIN_DIR}/commands"/*.md; do
	[ -f "$cmd_file" ] || continue
	cmd_name="$(basename "$cmd_file")"
	link_item "$cmd_file" "${COMMANDS_TARGET}/${cmd_name}" "$cmd_name"
done

echo ""
echo "Agents:"
AGENTS_TARGET="${OPENCODE_DIR}/agents"
mkdir -p "$AGENTS_TARGET"
for agent_file in "${PLUGIN_DIR}/agents"/*.md; do
	[ -f "$agent_file" ] || continue
	agent_name="$(basename "$agent_file")"
	link_item "$agent_file" "${AGENTS_TARGET}/${agent_name}" "$agent_name"
done

# ── Superpowers ───────────────────────────────────────────────
SUPERPOWERS_DIR="${OPENCODE_DIR}/superpowers"
SUPERPOWERS_REPO="https://github.com/obra/superpowers.git"
PLUGINS_TARGET="${OPENCODE_DIR}/plugins"

echo ""
echo "Superpowers:"

if [ -d "$SUPERPOWERS_DIR/.git" ]; then
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
mkdir -p "$PLUGINS_TARGET"
link_item "${SUPERPOWERS_DIR}/.opencode/plugins/superpowers.js" \
	"${PLUGINS_TARGET}/superpowers.js" \
	"superpowers plugin"

# Symlink superpowers skills
link_item "${SUPERPOWERS_DIR}/skills" \
	"${SKILLS_TARGET}/superpowers" \
	"superpowers skills"

# Symlink superpowers commands
for cmd_file in "${SUPERPOWERS_DIR}/commands"/*.md; do
	[ -f "$cmd_file" ] || continue
	cmd_name="$(basename "$cmd_file")"
	link_item "$cmd_file" "${COMMANDS_TARGET}/${cmd_name}" "superpowers: ${cmd_name}"
done

# ── Workmux ───────────────────────────────────────────────────
WORKMUX_DIR="${OPENCODE_DIR}/workmux"
WORKMUX_REPO="https://github.com/raine/workmux.git"

echo ""
echo "Workmux:"

if [ -d "$WORKMUX_DIR/.git" ]; then
	echo "  [update] pulling latest workmux..."
	git -C "$WORKMUX_DIR" pull --ff-only --quiet
else
	if [ -e "$WORKMUX_DIR" ]; then
		echo "  [backup] ${WORKMUX_DIR} -> ${WORKMUX_DIR}.bak"
		mv "$WORKMUX_DIR" "${WORKMUX_DIR}.bak"
	fi
	echo "  [clone] cloning workmux..."
	git clone --quiet "$WORKMUX_REPO" "$WORKMUX_DIR"
fi

# Register the workmux plugin (OpenCode uses ~/.config/opencode/plugin/)
WORKMUX_PLUGIN_TARGET="${OPENCODE_DIR}/plugin"
mkdir -p "$WORKMUX_PLUGIN_TARGET"
link_item "${WORKMUX_DIR}/.opencode/plugin/workmux-status.ts" \
	"${WORKMUX_PLUGIN_TARGET}/workmux-status.ts" \
	"workmux plugin"

# Symlink workmux skills
link_item "${WORKMUX_DIR}/skills" \
	"${SKILLS_TARGET}/workmux" \
	"workmux skills"

# ── Cleanup stale symlinks ────────────────────────────────────
echo ""
echo "Cleanup:"
for dir in "$COMMANDS_TARGET" "$SKILLS_TARGET" "$AGENTS_TARGET" "$PLUGINS_TARGET"; do
	[ -d "$dir" ] || continue
	for entry in "$dir"/*; do
		[ -L "$entry" ] || continue
		if [ ! -e "$entry" ]; then
			echo "  [remove] stale symlink: $(basename "$entry")"
			rm "$entry"
		fi
	done
done

echo ""
echo "Done. Restart OpenCode to pick up changes."
