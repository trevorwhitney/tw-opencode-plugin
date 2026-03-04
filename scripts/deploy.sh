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
echo "Done. Restart OpenCode to pick up changes."
