#!/usr/bin/env node
// The shelf: what is active, what is waiting in quarantine, what was sent to the archive.
//
//   node shelf.mjs list
//   node shelf.mjs overlap [--limit 20] [--cutoff 0.25]
//   node shelf.mjs promote <name> [--no-profile]
//   node shelf.mjs archive <name> --reason "..." [--lost-to <skill>]
//   node shelf.mjs restore <name>

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SKILLS, QUARANTINE, ARCHIVE, PROFILES, frontmatter } from "./paths.mjs";

const STOP = new Set(
  ("the and for with when this that you your use using should from into are can its their they them not all any via each such more most other than then asks ask user users task tasks tool tools code file files skill skills claude agent").split(" ")
);

// Mutually exclusive families: same recipe, different platform.
// `angular-ui-patterns` and `react-ui-patterns` describe the same thing and never compete
// for the same task — without this they top the overlap ranking and hide the real pairs.
const FAMILIES = [
  ["angular", "react", "vue", "svelte", "sveltekit", "astro", "flutter", "remotion"],
  ["linux", "windows", "macos"],
  ["postgres", "mysql", "mongodb", "sqlite"],
];

function tokenize(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function scopeConflict(a, b) {
  for (const family of FAMILIES) {
    const inA = family.filter((m) => a.has(m));
    const inB = family.filter((m) => b.has(m));
    if (inA.length && inB.length && !inA.some((m) => inB.includes(m))) return true;
  }
  return false;
}

function read(dir, state) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, "SKILL.md");
    if (!existsSync(file)) continue;
    const meta = frontmatter(readFileSync(file, "utf8"));
    const originFile = [join(dir, name, ".origin.json"), join(dir, name, ".origem.json")].find(existsSync);
    out.push({
      name,
      state,
      dir: join(dir, name),
      description: meta.description ?? "",
      tokens: tokenize(`${meta.name ?? name} ${meta.description ?? ""}`),
      origin: originFile ? JSON.parse(readFileSync(originFile, "utf8")) : null,
    });
  }
  return out;
}

function hasProfile(name) {
  if (!existsSync(PROFILES)) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^##\\s+\`?${escaped}\`?\\s*$`, "m").test(readFileSync(PROFILES, "utf8"));
}

function list() {
  const active = read(SKILLS, "active");
  const waiting = read(QUARANTINE, "quarantine");
  const archived = existsSync(ARCHIVE) ? readdirSync(ARCHIVE) : [];

  console.log(`\nACTIVE (${active.length}) — loaded in every session`);
  for (const s of active) {
    const marks = [hasProfile(s.name) ? "profiled" : null, s.origin ? `★${s.origin.stars ?? s.origin.estrelas} ${s.origin.repo}` : null]
      .filter(Boolean)
      .join(" · ");
    console.log(`  ${s.name.padEnd(42)} ${marks}`);
  }

  console.log(`\nQUARANTINE (${waiting.length}) — fetched, not loaded`);
  for (const s of waiting) console.log(`  ${s.name.padEnd(42)} ${s.origin ? `★${s.origin.stars} ${s.origin.repo}` : ""}`);

  console.log(`\nARCHIVE (${archived.length}) — rejected, recoverable`);
  for (const name of archived) {
    const verdict = join(ARCHIVE, name, "VERDICT.md");
    const legacy = join(ARCHIVE, name, "LAUDO.md");
    const file = existsSync(verdict) ? verdict : existsSync(legacy) ? legacy : null;
    const reason = file ? (readFileSync(file, "utf8").match(/^- (?:reason|motivo):\s*(.*)$/m)?.[1] ?? "") : "";
    console.log(`  ${name.padEnd(42)} ${reason}`);
  }
  console.log("");
}

function overlap(argv) {
  const cutoff = Number(option(argv, "--cutoff") ?? 0.25);
  const limit = Number(option(argv, "--limit") ?? 20);
  const all = [...read(SKILLS, "active"), ...read(QUARANTINE, "quarantine")].filter((s) => s.tokens.length);

  const freq = new Map();
  for (const s of all) for (const t of new Set(s.tokens)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const idf = (t) => Math.log(all.length / (freq.get(t) ?? 1));

  const pairs = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = new Set(all[i].tokens);
      const b = new Set(all[j].tokens);
      let shared = 0;
      let union = 0;
      for (const t of new Set([...a, ...b])) {
        const w = idf(t);
        union += w;
        if (a.has(t) && b.has(t)) shared += w;
      }
      let score = union ? shared / union : 0;
      if (scopeConflict(a, b)) score *= 0.35;
      if (score >= cutoff) pairs.push({ a: all[i], b: all[j], score });
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  if (!pairs.length) return console.log(`No pair above ${cutoff}. Lower the cutoff to see borderline ones.`);

  console.log(`\nPairs competing for the same ground (cutoff ${cutoff})\n`);
  for (const p of pairs.slice(0, limit)) {
    const mark = (s) => (s.state === "quarantine" ? " (quarantine)" : "");
    console.log(`${(p.score * 100).toFixed(0)}%  ${p.a.name}${mark(p.a)}  ×  ${p.b.name}${mark(p.b)}`);
    console.log(`      A: ${p.a.description.slice(0, 120)}`);
    console.log(`      B: ${p.b.description.slice(0, 120)}`);
    const unprofiled = [p.a, p.b].filter((s) => !hasProfile(s.name)).map((s) => s.name);
    if (unprofiled.length) console.log(`      no measured profile: ${unprofiled.join(", ")}`);
    console.log("");
  }
  console.log("High overlap is not a verdict. Only a bench says whether they deliver the same thing.");
  console.log("Next: node bench.mjs setup <track> <skillA> <skillB>");
}

function promote(argv) {
  const name = positional(argv)[0];
  if (!name) die("Pass the name of a skill in quarantine.");
  const from = join(QUARANTINE, name);
  const to = join(SKILLS, name);
  if (!existsSync(from)) die(`Not in quarantine: ${from}`);
  if (existsSync(to)) die(`A skill with that name is already active: ${to}`);
  if (!hasProfile(name) && !argv.includes("--no-profile")) {
    die(
      `PROFILES.md has no "## ${name}" section.\n` +
        "A skill with no measured profile goes in blind and the router cannot tell when to use it.\n" +
        "Bench it first, or repeat with --no-profile when the case is obvious."
    );
  }
  renameSync(from, to);
  console.log(`Active: ${to}`);
  console.log("Restart the Claude Code session for it to be picked up.");
}

function archive(argv) {
  const name = positional(argv)[0];
  const reason = option(argv, "--reason");
  const lostTo = option(argv, "--lost-to");
  if (!name) die("Pass the name.");
  if (!reason) die('Pass --reason "why it lost". An archive with no verdict teaches nothing.');

  const from = existsSync(join(SKILLS, name))
    ? join(SKILLS, name)
    : existsSync(join(QUARANTINE, name))
      ? join(QUARANTINE, name)
      : null;
  if (!from) die(`Found no ${name} in skills/ or quarantine.`);
  if (name === "skill-recruiter") die("No. That is the one doing the deciding.");

  mkdirSync(ARCHIVE, { recursive: true });
  const to = join(ARCHIVE, name);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  rmSync(from, { recursive: true, force: true });

  const originFile = [join(to, ".origin.json"), join(to, ".origem.json")].find(existsSync);
  const origin = originFile ? JSON.parse(readFileSync(originFile, "utf8")) : null;
  writeFileSync(
    join(to, "VERDICT.md"),
    [
      `# ${name} — archived`,
      "",
      `- date: ${new Date().toISOString().slice(0, 10)}`,
      `- reason: ${reason}`,
      lostTo ? `- lost to: ${lostTo}` : null,
      `- came from: ${origin ? `${origin.repo} (★${origin.stars ?? origin.estrelas}, commit ${String(origin.commit).slice(0, 7)})` : "local install, origin not recorded"}`,
      "",
      `Restore: \`node shelf.mjs restore ${name}\``,
      "",
    ]
      .filter((l) => l !== null)
      .join("\n")
  );

  console.log(`Archived: ${to}`);
  console.log(`Verdict written to ${join(to, "VERDICT.md")}`);
  console.log("Remove its line from CATALOG.md and PROFILES.md.");
}

function restore(argv) {
  const name = positional(argv)[0];
  if (!name) die("Pass the name.");
  const from = join(ARCHIVE, name);
  if (!existsSync(from)) die(`Not in the archive: ${from}`);
  mkdirSync(QUARANTINE, { recursive: true });
  const to = join(QUARANTINE, name);
  renameSync(from, to);
  rmSync(join(to, "VERDICT.md"), { force: true });
  console.log(`Back in quarantine: ${to}`);
}

function positional(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      if (argv[i] !== "--no-profile") i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

function option(argv, flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? null : argv[i + 1];
}

function die(message) {
  console.error(message);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const table = { list, overlap, promote, archive, restore };
if (!table[command]) {
  console.error("Commands: list | overlap | promote | archive | restore");
  process.exit(1);
}
table[command](rest);
