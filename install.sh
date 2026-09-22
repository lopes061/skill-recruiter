#!/usr/bin/env bash
# Installs skill-recruiter into your agent's skills directory.
# No network, no sudo, nothing outside your home directory.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_home() {
  if [ -n "${SKILLS_HOME:-}" ]; then echo "$SKILLS_HOME"; return; fi
  for candidate in "$HOME/.claude/skills" "$HOME/.claude-shared/skills"; do
    if [ -d "$candidate" ]; then
      # `cd -P` resolves symlinks without needing python or GNU readlink.
      (cd -P "$candidate" && pwd)
      return
    fi
  done
  echo "$HOME/.claude/skills"
}

skills_home="$(resolve_home)"
target="$skills_home/skill-recruiter"
base="$(dirname "$skills_home")"

echo "Skills directory: $skills_home"

if [ -e "$target" ]; then
  # CATALOG.md and PROFILES.md are yours. Move the old copy, never overwrite it.
  backup="$target.backup-$(date +%Y%m%d-%H%M%S)"
  mv "$target" "$backup"
  echo "Previous install kept at $backup"
fi

mkdir -p "$skills_home" "$base/skills-quarantine" "$base/skills-archive"
cp -R "$here/skills/skill-recruiter" "$target"

echo
echo "Installed at $target"
echo "Quarantine:  $base/skills-quarantine"
echo "Archive:     $base/skills-archive"
echo
echo "Try it:  node \"$target/scripts/analyze.mjs\" --installed"
echo "Restart your agent for the skill to be picked up."
