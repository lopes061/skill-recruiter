#!/usr/bin/env node
// Finds skills on GitHub, ranks them, and drops the ones you choose into quarantine.
//
//   node discover.mjs search <terms...> [--limit 12] [--min-stars 10]
//   node discover.mjs inspect <owner/repo> [--filter <text>] [--limit 30]
//   node discover.mjs fetch <owner/repo> [path/to/skill ...]
//
// Uses `gh` when it is installed and logged in (5000 requests/hour), then GITHUB_TOKEN,
// then the anonymous API (10 searches per minute).
//
// Nothing this command does makes a skill active. Quarantine is not on the load path.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { SKILLS, QUARANTINE, frontmatter } from "./paths.mjs";

const GH = hasGh();

function hasGh() {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function api(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const target = path + (qs ? "?" + qs : "");
  if (GH) {
    const out = execFileSync("gh", ["api", "--method", "GET", target], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out);
  }
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "skill-bench" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch("https://api.github.com/" + target, { headers });
  if (res.status === 403 || res.status === 429) {
    throw new Error(`GitHub refused (${res.status}). Remaining: ${res.headers.get("x-ratelimit-remaining")}. Run 'gh auth login' to raise the limit.`);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${target}`);
  return res.json();
}

async function raw(repo, ref, path) {
  const headers = { "User-Agent": "skill-bench" };
  if (!GH && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`, { headers });
  return res.ok ? res.text() : null;
}

function installed() {
  if (!existsSync(SKILLS)) return new Set();
  return new Set(readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, "SKILL.md"))));
}

function quarantined() {
  if (!existsSync(QUARANTINE)) return new Set();
  return new Set(readdirSync(QUARANTINE).filter((d) => existsSync(join(QUARANTINE, d, "SKILL.md"))));
}

const days = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

// A curated list is not a skill. `awesome-mac` has 114k stars and one stray SKILL.md;
// without this it buries every repo that actually ships skills.
const COLLECTION = /\b(awesome|curated|list-of|collection|resources|cheat-?sheet|roadmap|interview)\b/i;

function baseScore(repo) {
  const stars = repo.stargazers_count ?? 0;
  const age = days(repo.pushed_at);
  // Stars saturate at 10k: past that, more stars means famous for something else.
  let score = Math.min(Math.log10(stars + 1), 4) * 35;
  if (COLLECTION.test(repo.full_name) || COLLECTION.test(repo.description ?? "")) score -= 70;
  if ((repo.topics ?? []).some((topic) => COLLECTION.test(topic))) score -= 40;
  if (age < 30) score += 25;
  else if (age < 90) score += 18;
  else if (age < 180) score += 12;
  else if (age < 365) score += 6;
  if (repo.license) score += 5;
  if (repo.description) score += 5;
  if (repo.archived) score -= 40;
  if (repo.fork) score -= 15;
  return Math.round(score);
}

// ---------------------------------------------------------------- search

async function search(argv) {
  const limit = Number(option(argv, "--limit") ?? 12);
  const minStars = Number(option(argv, "--min-stars") ?? 10);
  const terms = positional(argv).join(" ").trim();
  if (!terms) die("Say what to look for. Example: node discover.mjs search prisma database");

  const queries = [
    `${terms} claude skill in:name,description,readme stars:>=${minStars}`,
    `${terms} topic:claude-skills stars:>=${minStars}`,
    `${terms} "agent skills" in:name,description stars:>=${minStars}`,
  ];

  const found = new Map();
  for (const q of queries) {
    try {
      const res = await api("search/repositories", { q, sort: "stars", order: "desc", per_page: "30" });
      for (const repo of res.items ?? []) if (!found.has(repo.full_name)) found.set(repo.full_name, repo);
    } catch (e) {
      console.error(`  (query failed: ${e.message})`);
    }
  }
  if (!found.size) return console.log("Nothing found. Widen the terms or lower --min-stars.");

  const shortlist = [...found.values()].sort((a, b) => baseScore(b) - baseScore(a)).slice(0, Math.max(limit * 2, 12));
  for (const repo of shortlist) {
    try {
      const tree = await api(`repos/${repo.full_name}/git/trees/${repo.default_branch}`, { recursive: "1" });
      repo._skills = (tree.tree ?? []).filter((n) => n.path.endsWith("SKILL.md")).map((n) => n.path);
    } catch {
      repo._skills = null;
    }
  }

  // A repo dedicated to skills outranks one with a stray SKILL.md in it.
  const score = (r) => baseScore(r) + Math.min(r._skills?.length ?? 0, 10) * 4;
  const ranked = shortlist
    .filter((r) => r._skills === null || r._skills.length > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);

  const have = installed();
  console.log(`\nCandidates for "${terms}" — saturated stars, recent activity, skill density\n`);
  for (const repo of ranked) {
    const count = repo._skills === null ? "?" : repo._skills.length;
    const clash = [...new Set((repo._skills ?? []).map((p) => basename(dirname(p))).filter((n) => have.has(n)))];
    console.log(`${String(score(repo)).padStart(3)} pts  ★${String(repo.stargazers_count).padStart(6)}  ${repo.full_name}`);
    console.log(`          ${repo.description ?? "(no description)"}`);
    console.log(
      `          ${count} SKILL.md · pushed ${days(repo.pushed_at)}d ago · ${repo.license?.spdx_id ?? "no license"}` +
        (clash.length ? ` · ALREADY HAVE: ${clash.slice(0, 5).join(", ")}` : "")
    );
    console.log("");
  }
  const empty = shortlist.filter((r) => r._skills !== null && r._skills.length === 0).length;
  if (empty) console.log(`(${empty} repo(s) with no SKILL.md left out)`);
  console.log("Next: node discover.mjs inspect <owner/repo>");
}

// --------------------------------------------------------------- inspect

async function inspect(argv) {
  const repo = positional(argv)[0];
  if (!repo?.includes("/")) die("Pass owner/repo. Example: node discover.mjs inspect anthropics/skills");
  const filter = option(argv, "--filter")?.toLowerCase();
  const cap = Number(option(argv, "--limit") ?? 30);

  const meta = await api(`repos/${repo}`);
  const tree = await api(`repos/${repo}/git/trees/${meta.default_branch}`, { recursive: "1" });
  const all = (tree.tree ?? []).filter((n) => n.path.endsWith("SKILL.md")).map((n) => n.path);
  const matched = filter ? all.filter((p) => p.toLowerCase().includes(filter)) : all;
  const paths = matched.slice(0, cap);

  console.log(`\n${repo} — ★${meta.stargazers_count} · pushed ${days(meta.pushed_at)}d ago · ${all.length} skills`);
  if (tree.truncated) console.log("(tree truncated by GitHub: some skills may be missing)");
  if (filter) console.log(`filter "${filter}": ${matched.length} matched`);
  if (matched.length > paths.length) console.log(`showing ${paths.length} — each description costs one request. Use --filter or --limit.`);
  console.log("");

  const have = installed();
  const waiting = quarantined();
  for (const path of paths) {
    const text = await raw(repo, meta.default_branch, path);
    const meta2 = frontmatter(text ?? "");
    const name = meta2.name || basename(dirname(path));
    const mark = have.has(name) ? " [INSTALLED]" : waiting.has(name) ? " [IN QUARANTINE]" : "";
    const runsCode = text && /\b(node|python3?|bash|sh)\s+\S+\.(mjs|js|py|sh)/.test(text);
    console.log(`• ${name}${mark}${runsCode ? " ⚠ runs a script" : ""}`);
    console.log(`  ${path}`);
    console.log(`  ${(meta2.description || "(no description)").slice(0, 220)}`);
    console.log("");
  }
  console.log(`Fetch everything: node discover.mjs fetch ${repo}`);
  console.log(`Fetch one:       node discover.mjs fetch ${repo} ${paths[0] ? dirname(paths[0]) : "path/to/skill"}`);
}

// ----------------------------------------------------------------- fetch

async function fetch_(argv) {
  const args = positional(argv);
  const repo = args[0];
  if (!repo?.includes("/")) die("Pass owner/repo.");
  const wanted = args.slice(1);

  const meta = await api(`repos/${repo}`);
  const temp = join(tmpdir(), `skill-bench-${Date.now()}`);
  const url = `https://github.com/${repo}.git`;

  if (wanted.length) {
    // Big repos (microsoft/playwright and friends): take only the folders asked for.
    console.log(`Cloning ${repo} (sparse)…`);
    execFileSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", url, temp], { stdio: "pipe" });
    execFileSync("git", ["-C", temp, "sparse-checkout", "set", ...wanted.map((w) => w.replace(/\/SKILL\.md$/, ""))], { stdio: "pipe" });
  } else {
    console.log(`Cloning ${repo} (shallow)…`);
    execFileSync("git", ["clone", "--depth", "1", url, temp], { stdio: "pipe" });
  }
  const commit = execFileSync("git", ["-C", temp, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const found = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === ".git" || entry === "node_modules") continue;
      const full = join(dir, entry);
      // A symlink is skipped: dangling in a sparse clone, and a way out of the folder in a hostile repo.
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(full);
      else if (entry === "SKILL.md") found.push(full);
    }
  })(temp);

  const have = installed();
  mkdirSync(QUARANTINE, { recursive: true });
  let copied = 0;

  for (const file of found) {
    const from = dirname(file);
    const rel = from.slice(temp.length + 1) || ".";
    if (wanted.length && !wanted.some((w) => rel.startsWith(w.replace(/\/SKILL\.md$/, "")))) continue;

    const meta2 = frontmatter(readFileSync(file, "utf8"));
    let name = meta2.name || basename(from);
    if (have.has(name)) name = `${name}--${repo.split("/")[0]}`;

    const dest = join(QUARANTINE, name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(from, dest, { recursive: true, filter: (src) => !lstatSync(src).isSymbolicLink() });

    writeFileSync(
      join(dest, ".origin.json"),
      JSON.stringify(
        {
          repo,
          url: `https://github.com/${repo}`,
          path: rel,
          commit,
          stars: meta.stargazers_count,
          license: meta.license?.spdx_id ?? null,
          fetched: new Date().toISOString().slice(0, 10),
          original_name: meta2.name || basename(from),
        },
        null,
        2
      ) + "\n"
    );
    console.log(`  quarantine/${name}  ←  ${rel}`);
    copied++;
  }
  rmSync(temp, { recursive: true, force: true });

  if (!copied) return console.log("Nothing matched. Run `inspect` to see the paths.");
  console.log(`\n${copied} skill(s) in ${QUARANTINE}`);
  console.log("\nREAD BEFORE PROMOTING. A SKILL.md becomes instructions the agent obeys.");
  console.log("Next: node analyze.mjs --all");
}

function positional(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      i++;
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
const table = { search, inspect, fetch: fetch_ };
if (!table[command]) {
  console.error("Commands: search | inspect | fetch");
  process.exit(1);
}
if (!GH && !process.env.GITHUB_TOKEN) console.error("(no gh login and no GITHUB_TOKEN — anonymous API, 10 searches/minute)\n");
await table[command](rest);
