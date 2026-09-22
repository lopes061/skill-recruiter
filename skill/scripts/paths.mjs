// Where skills live on this machine. Nothing else in the toolkit hardcodes a path.
//
// Resolution order:
//   1. $SKILLS_HOME                     — explicit override
//   2. ~/.claude/skills                 — default Claude Code location (symlinks resolved)
//   3. ~/.claude-shared/skills          — common setup when skills are shared across accounts
//
// Quarantine and archive are siblings of the skills directory. Older Portuguese
// directory names are honored when they already exist, so an existing install keeps working.

import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function resolveSkillsHome() {
  if (process.env.SKILLS_HOME) return process.env.SKILLS_HOME;
  const candidates = [join(homedir(), ".claude", "skills"), join(homedir(), ".claude-shared", "skills")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  return candidates[0];
}

function sibling(base, preferred, legacy) {
  const legacyPath = join(base, legacy);
  if (existsSync(legacyPath)) return legacyPath;
  return join(base, preferred);
}

export const SKILLS = resolveSkillsHome();
const BASE = dirname(SKILLS);

export const QUARANTINE = sibling(BASE, "skills-quarantine", "skills-quarentena");
export const ARCHIVE = sibling(BASE, "skills-archive", "skills-arquivo");
export const BENCH = sibling(BASE, "bench", "bancada");

export const SELF = join(SKILLS, "skill-recruiter");
export const PROFILES = join(SELF, "PROFILES.md");
export const CATALOG = join(SELF, "CATALOG.md");
export const PROBES = join(SELF, "probes");

/** Reads the frontmatter of a SKILL.md. Tolerates CRLF and folded (`>`) scalars. */
export function frontmatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const fields = {};
  let key = null;
  for (const line of text.slice(4, end).split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (match) {
      key = match[1];
      fields[key] = match[2].replace(/^[>|]\s*$/, "").trim();
    } else if (key && line.trim()) {
      fields[key] = (fields[key] + " " + line.trim()).trim();
    }
  }
  return fields;
}
