#!/usr/bin/env node
// One entry point for every command, so nobody has to remember script paths.
//
//   npx github:lopes061/skill-recruiter install
//   npx github:lopes061/skill-recruiter search "prisma database"
//   npx github:lopes061/skill-recruiter analyze --installed
//   npx github:lopes061/skill-recruiter bench setup visual a b
//   npx github:lopes061/skill-recruiter shelf list

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL = join(ROOT, "skills", "skill-recruiter");
const SCRIPTS = join(SKILL, "scripts");

const ROUTES = {
  search: ["discover.mjs", "search"],
  inspect: ["discover.mjs", "inspect"],
  fetch: ["discover.mjs", "fetch"],
  analyze: ["analyze.mjs"],
  bench: ["bench.mjs"],
  shelf: ["shelf.mjs"],
};

function run(script, args) {
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

function skillsHome() {
  if (process.env.SKILLS_HOME) return process.env.SKILLS_HOME;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  for (const candidate of [join(home, ".claude", "skills"), join(home, ".claude-shared", "skills")]) {
    if (existsSync(candidate)) return candidate;
  }
  return join(home, ".claude", "skills");
}

function install() {
  const home = skillsHome();
  const target = join(home, "skill-recruiter");

  if (existsSync(target)) {
    // Your catalog and profiles live in there. Move, never overwrite.
    const backup = `${target}.backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
    renameSync(target, backup);
    console.log(`Previous install kept at ${backup}`);
  }

  mkdirSync(home, { recursive: true });
  cpSync(SKILL, target, { recursive: true });
  const base = dirname(home);
  for (const folder of ["skills-quarantine", "skills-archive"]) mkdirSync(join(base, folder), { recursive: true });

  const count = readdirSync(home).filter((d) => existsSync(join(home, d, "SKILL.md"))).length;
  console.log(`\nInstalled at ${target}`);
  console.log(`Skills on this machine: ${count}`);
  console.log(`Quarantine: ${join(base, "skills-quarantine")}`);
  console.log(`Archive:    ${join(base, "skills-archive")}`);
  console.log("\nTry it:");
  console.log("  npx github:lopes061/skill-recruiter analyze --installed");
  console.log("\nRestart your agent for the skill to be picked up.");
}

function help() {
  console.log(`skill-recruiter — HR for your agent's skills

  install                     copy the skill into your skills directory
  search <terms>              find candidates on GitHub, ranked
  inspect <owner/repo>        list what a repo ships, with descriptions
  fetch <owner/repo> [path]   copy into quarantine (never into skills/)
  analyze --installed         audit what is already active
  analyze --all               read everything in quarantine
  bench setup|compare|reveal|verdict
  shelf list|overlap|promote|archive|restore

Docs: https://github.com/lopes061/skill-recruiter`);
}

const [command, ...args] = process.argv.slice(2);
if (!command || command === "help" || command === "--help") help();
else if (command === "install") install();
else if (ROUTES[command]) {
  const [script, sub] = ROUTES[command];
  run(script, sub ? [sub, ...args] : args);
} else {
  console.error(`Unknown command: ${command}`);
  help();
  process.exit(1);
}
