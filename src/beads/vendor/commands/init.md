---
description: Initialize beads in the current project
argument-hint: [prefix]
---

Initialize beads issue tracking in the current directory.

**Default behavior:** Use `--stealth` mode unless the user explicitly requests standard (non-stealth) initialization. Stealth mode keeps beads data local-only without committing .beads/ files to the repository.

If a prefix is provided as $1, use it as the issue prefix (e.g., "myproject" creates issues like myproject-1, myproject-2). If not provided, the default is the current directory name.

Use the bash tool to run: `bd init --stealth --quiet [prefix]`

If the user explicitly asks for non-stealth mode, omit the `--stealth` flag:
`bd init --quiet [prefix]`

After initialization, run `bd prime` to verify and show the user the initial state.
