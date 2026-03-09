#!/usr/bin/env bash
set -euo pipefail

# Compile TypeScript
tsc

# Copy vendor markdown files that tsc doesn't emit
for module in beads workmux; do
  rm -rf "dist/${module}/vendor"
  mkdir -p "dist/${module}"
  cp -r "src/${module}/vendor" "dist/${module}/vendor"
done
