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
SUPERPOWERS_REPO="https://github.com/obra/superpowers.git"

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
link_item "${SUPERPOWERS_DIR}/.opencode/plugins/superpowers.js" \
	"${PLUGINS_TARGET}/superpowers.js" \
	"superpowers plugin"

# Copy superpowers skills individually (skip skills overridden by plugin)
SUPERPOWERS_SKIP_SKILLS="subagent-driven-development writing-plans"

if [ -L "${SKILLS_TARGET}/superpowers" ]; then
	echo "  [migrate] removing old superpowers directory symlink"
	rm "${SKILLS_TARGET}/superpowers"
fi
mkdir -p "${SKILLS_TARGET}/superpowers"

for sp_skill_dir in "${SUPERPOWERS_DIR}/skills"/*/; do
	[ -d "$sp_skill_dir" ] || continue
	sp_skill_name="$(basename "$sp_skill_dir")"
	case " $SUPERPOWERS_SKIP_SKILLS " in
	*" $sp_skill_name "*)
		echo "  [skip] superpowers/${sp_skill_name} (overridden by plugin)"
		continue
		;;
	esac
	copy_dir "$sp_skill_dir" "${SKILLS_TARGET}/superpowers/${sp_skill_name}" "superpowers/${sp_skill_name}"
done

# Copy superpowers commands
for cmd_file in "${SUPERPOWERS_DIR}/commands"/*.md; do
	[ -f "$cmd_file" ] || continue
	cmd_name="$(basename "$cmd_file")"
	copy_item "$cmd_file" "${COMMANDS_TARGET}/${cmd_name}" "superpowers: ${cmd_name}"
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

# Register the workmux plugin (OpenCode discovers plugins from plugins/ plural)
link_item "${WORKMUX_DIR}/.opencode/plugin/workmux-status.ts" \
	"${PLUGINS_TARGET}/workmux-status.ts" \
	"workmux plugin"

# Copy workmux skills
copy_dir "${WORKMUX_DIR}/skills" \
	"${SKILLS_TARGET}/workmux" \
	"workmux skills"

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

echo ""
echo "Done. Restart OpenCode to pick up changes."
