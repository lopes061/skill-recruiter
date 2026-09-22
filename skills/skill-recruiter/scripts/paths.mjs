// Where skills live on this machine, and where this tool may write.
//
// Skills directory, in order:
//   1. $SKILLS_HOME                     — explicit override
//   2. ~/.claude/skills                 — default Claude Code location (symlinks resolved)
//   3. ~/.claude-shared/skills          — common when skills are shared across accounts
//
// Quarantine, archive and bench folders are siblings of that directory. Older Portuguese
// names are honored when they already exist, so an existing install keeps working.

import { existsSync, mkdirSync, copyFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveSkillsHome() {
  if (process.env.SKILLS_HOME) return process.env.SKILLS_HOME;
  for (const candidate of [join(homedir(), ".claude", "skills"), join(homedir(), ".claude-shared", "skills")]) {
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  return join(homedir(), ".claude", "skills");
}

function sibling(base, preferred, legacy) {
  const legacyPath = join(base, legacy);
  return existsSync(legacyPath) ? legacyPath : join(base, preferred);
}

export const SKILLS = resolveSkillsHome();
const BASE = dirname(SKILLS);

export const QUARANTINE = sibling(BASE, "skills-quarantine", "skills-quarentena");
export const ARCHIVE = sibling(BASE, "skills-archive", "skills-arquivo");
export const BENCH = sibling(BASE, "bench", "bancada");

/** This skill's own folder, wherever it was installed from. */
export const SELF = dirname(dirname(fileURLToPath(import.meta.url)));

// Installed as a plugin, the folder is a cache that gets replaced on every update.
// Your catalog and your profiles are yours, so they live outside it.
const INSIDE_PLUGIN = /[\\/](plugins|marketplaces)[\\/]/.test(SELF);
export const DATA = INSIDE_PLUGIN ? join(BASE, "skill-recruiter") : SELF;

export const PROBES = join(SELF, "probes");
export const PROFILES = join(DATA, "PROFILES.md");
export const CATALOG = join(DATA, "CATALOG.md");

/** Creates the data directory on first use and seeds it with the shipped examples. */
export function ensureData() {
  if (DATA === SELF) return DATA;
  mkdirSync(DATA, { recursive: true });
  for (const file of ["PROFILES.md", "CATALOG.md"]) {
    const target = join(DATA, file);
    const seed = join(SELF, file);
    if (!existsSync(target) && existsSync(seed)) copyFileSync(seed, target);
  }
  return DATA;
}

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
