# Spec and Plan Locations

Write specs to:

```
/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/specs/
```

Write plans to:

```
/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/plans/
```

After writing a spec or plan, symlink it into the repo at the default location so it is accessible locally:

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
ln -sf "<obsidian-specs-path>/<filename>" "docs/superpowers/specs/<filename>"
ln -sf "<obsidian-plans-path>/<filename>" "docs/superpowers/plans/<filename>"
```

# Worktrees

Place worktrees as siblings to this project directory, under `~/workspace/project/`.
For example, a worktree tracking branch `foo` should go to `~/workspace/project/foo`.
