#!/usr/bin/env bash
# Installs skill-recruiter into your Claude Code skills directory.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_home() {
  if [ -n "${SKILLS_HOME:-}" ]; then echo "$SKILLS_HOME"; return; fi
  for candidate in "$HOME/.claude/skills" "$HOME/.claude-shared/skills"; do
    if [ -d "$candidate" ]; then
      # Follow a symlink so quarantine and archive land next to the real directory.
      python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$candidate"
      return
    fi
  done
  echo "$HOME/.claude/skills"
}

skills_home="$(resolve_home)"
target="$skills_home/skill-recruiter"

echo "Skills directory: $skills_home"

if [ -e "$target" ]; then
  read -r -p "skill-recruiter is already installed. Overwrite it? [y/N] " answer
  case "$answer" in
    [yY]*) ;;
    *) echo "Nothing changed."; exit 0 ;;
  esac
  # CATALOG.md and PROFILES.md hold your own shelf. Never clobber them silently.
  backup="$target.backup-$(date +%Y%m%d-%H%M%S)"
  mv "$target" "$backup"
  echo "Previous install kept at $backup"
fi

mkdir -p "$skills_home"
cp -R "$here/skill" "$target"
mkdir -p "$(dirname "$skills_home")/skills-quarantine" "$(dirname "$skills_home")/skills-archive"

echo
echo "Installed at $target"
echo "Quarantine:  $(dirname "$skills_home")/skills-quarantine"
echo "Archive:     $(dirname "$skills_home")/skills-archive"
echo
echo "Next:"
echo "  node \"$target/scripts/shelf.mjs\" list"
echo "  node \"$target/scripts/analyze.mjs\" --installed"
echo
echo "Restart Claude Code for the skill to be picked up."
