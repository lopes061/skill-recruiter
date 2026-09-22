#!/usr/bin/env node
// Reads a skill end to end — SKILL.md plus every file it ships — and reports what it found.
//
//   node analyze.mjs <skill-directory> [--project <dir>] [--json]
//   node analyze.mjs --all                    # every skill sitting in quarantine
//   node analyze.mjs --installed              # every skill already active (audit pass)
//
// Stars measure popularity. This measures the document.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { SKILLS, QUARANTINE, frontmatter } from "./paths.mjs";

const WEIGHT = { critical: 100, high: 18, medium: 8, low: 3 };

// ---------------------------------------------------------------- reading

function readSkill(dir) {
  const main = join(dir, "SKILL.md");
  if (!existsSync(main)) throw new Error(`No SKILL.md in ${dir}`);

  const files = [];
  (function walk(current) {
    for (const entry of readdirSync(current)) {
      if (entry === ".git" || entry === "node_modules") continue;
      const full = join(current, entry);
      const stat = statSync(full, { throwIfNoEntry: false });
      if (!stat) continue;
      if (stat.isDirectory()) walk(full);
      else if (/\.(md|ts|tsx|js|mjs|py|sh|json)$/.test(entry) && stat.size < 2_000_000) {
        files.push({ path: full, rel: relative(dir, full), text: readFileSync(full, "utf8") });
      }
    }
  })(dir);

  const text = readFileSync(main, "utf8");
  const meta = frontmatter(text);
  const originPath = join(dir, ".origin.json");
  const legacyOrigin = join(dir, ".origem.json");
  const origin = existsSync(originPath)
    ? JSON.parse(readFileSync(originPath, "utf8"))
    : existsSync(legacyOrigin)
      ? JSON.parse(readFileSync(legacyOrigin, "utf8"))
      : null;

  return { dir, name: meta.name || basename(dir), meta, text, files, origin };
}

/** Line numbers make a finding checkable. Without them a report is just an opinion. */
function lines(text) {
  return text.split(/\r?\n/);
}

function inFence(allLines, index) {
  let open = false;
  for (let i = 0; i < index; i++) if (/^\s*```/.test(allLines[i])) open = !open;
  return open;
}

// ---------------------------------------------------------------- checks

function checkMetadata(skill, add) {
  const { meta } = skill;
  if (!meta.name) add("metadata", "high", "Frontmatter has no `name`: the Skill tool cannot address it.");
  if (!meta.description) {
    add("metadata", "high", "Frontmatter has no `description`: the model never learns when to load it.");
    return;
  }
  if (meta.description.length < 40) {
    add("metadata", "medium", `Description is ${meta.description.length} chars — too short to route on.`);
  }
  if (meta.description.length > 1024) {
    add("metadata", "low", `Description is ${meta.description.length} chars; it is injected into every session.`);
  }
  if (!/\b(use when|when the user|use this|triggers? on|invoke when)\b/i.test(meta.description)) {
    add("metadata", "medium", 'Description states what it is but never "use when…", so routing has nothing to match.');
  }
}

function checkDeadReferences(skill, add) {
  const seen = new Set();
  for (const file of skill.files) {
    if (!file.rel.endsWith(".md")) continue;
    const all = lines(file.text);
    const SHIPPED = /^(references|resources|templates|scripts|assets|examples|docs)\//;
    all.forEach((line, i) => {
      // Caminho citado dentro de bloco de código é exemplo de saída, não arquivo que a skill envia.
      if (inFence(all, i)) return;
      const targets = [
        ...[...line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]),
        ...[...line.matchAll(/`((?:references|resources|templates|scripts|assets|examples)\/[^`]+)`/g)].map((m) => m[1]),
      ];
      for (const raw of targets) {
        const target = raw.split("#")[0].trim();
        if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
        // Só interessa o que a skill promete entregar: documento próprio ou pasta que ela envia.
        if (!target.endsWith(".md") && !SHIPPED.test(target)) continue;
        // `templates/<react|vue>/Button.story.*` é padrão, não caminho.
        if (/[<>*|{}]/.test(target)) continue;
        // `../../agents/foo.md` points into the source repo, not into what the skill ships.
        if (target.startsWith("../")) continue;
        // Um documento dentro de references/ costuma citar o irmão pelo caminho da raiz da skill.
        const candidates = [resolve(dirname(file.path), target), resolve(skill.dir, target)];
        const key = `${file.rel}:${target}`;
        if (candidates.some(existsSync) || seen.has(key)) continue;
        seen.add(key);
        add("dead-reference", "high", `${file.rel}:${i + 1} points to \`${target}\`, which does not exist.`);
      }
    });
  }
}

function checkPhantomSkills(skill, add, installed) {
  const mentioned = new Map();
  for (const file of skill.files) {
    if (!file.rel.endsWith(".md")) continue;
    lines(file.text).forEach((line, i) => {
      if (!/\b(skill|agent|subagent)\b/i.test(line) && !/@[a-z]/.test(line)) return;
      const names = [
        ...[...line.matchAll(/@([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/g)].map((m) => m[1]),
        ...[...line.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g)].map((m) => m[1]),
      ];
      for (const candidate of names) {
        if (candidate === skill.name || installed.has(candidate)) continue;
        if (!/(-expert|-skills?|-patterns|-best-practices|-optimizer|-reviewer|-guidelines|-testing|-cli)$/.test(candidate)) continue;
        if (!mentioned.has(candidate)) mentioned.set(candidate, `${file.rel}:${i + 1}`);
      }
    });
  }
  for (const [name, where] of mentioned) {
    add("phantom-dependency", "medium", `${where} tells the model to use \`${name}\`, which is not installed here.`);
  }
}

function checkSubstance(skill, add) {
  const all = lines(skill.text);
  const body = all.slice(all.indexOf("---", 1) + 1);
  const content = body.filter((l) => l.trim());
  let code = 0;
  let open = false;
  for (const line of body) {
    if (/^\s*```/.test(line)) {
      open = !open;
      continue;
    }
    if (open && line.trim()) code++;
  }

  const hollowChecklist = content.filter((l) => /^- \[ \]\s+\S+(\s+\S+){0,3}\s*$/.test(l) && !/[.`/(]/.test(l)).length;
  const delegation = (skill.text.match(/Use\s+@[a-z0-9-]+/g) ?? []).length;
  const ratio = content.length ? code / content.length : 0;

  if (content.length < 35) {
    add("substance", "medium", `Only ${content.length} lines of content — thin.`);
  }
  if (code === 0 && content.length < 80) {
    add(
      "substance",
      "high",
      "No command, no example, no code: it asserts instead of showing. A bench can still prove it right — the model may know the subject without the file saying much."
    );
  }
  if (ratio < 0.08 && hollowChecklist >= 4) {
    add(
      "substance",
      "high",
      `Hollow: ${(ratio * 100).toFixed(0)}% code lines and ${hollowChecklist} checklist items with no noun to check ("Performance improved").`
    );
  }
  if (delegation >= 3 && ratio < 0.12) {
    add("substance", "high", `${delegation} "Use @other-skill" stubs and almost no content of its own — it delegates instead of knowing.`);
  }
  return { content: content.length, code, ratio };
}

const DANGER = [
  [/(curl|wget)[^\n|]*\|\s*(sudo\s+)?(ba)?sh\b/i, "critical", "pipes a download straight into a shell"],
  [/\b(base64\s+(-d|--decode)[^\n]*\|\s*(ba)?sh)\b/i, "critical", "decodes and executes an opaque payload"],
  [/(~\/\.ssh|id_rsa|\.aws\/credentials|\.npmrc|security\s+find-generic-password|login\.keychain)/i, "critical", "reaches for credentials outside the project"],
  [/(edit|write|append|modify|update|add to|patch)[^\n]{0,48}(CLAUDE\.md|settings\.local\.json|settings\.json|\.claude\/(?!skills))/i, "critical", "instructs the agent to rewrite its own harness configuration"],
  [/(history\.jsonl|\.claude\/sessions|session\s+transcripts?)/i, "critical", "reads the agent's own session history"],
  [/\brm\s+-[rRf]{1,2}f?\s+[^\n]{0,60}/, "high", "destructive file removal"],
  [/\b(prisma\s+)?migrate\s+reset|db\s+push\s+--(force-reset|accept-data-loss)/i, "high", "drops a database"],
  [/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, "high", "destructive SQL"],
  [/git\s+push\s+--force(?!-with-lease)/i, "high", "force push that can erase someone else's commits"],
  [/\bchmod\s+777\b/, "high", "world-writable permissions"],
  [/\bsudo\s+(?!apt|dnf|yum)/, "medium", "asks for root"],
];

const NEGATED = /\b(never|do not|don't|avoid|must not|refuse|reject|forbidden|prohibited|warning|instead of|nunca|n[ãa]o|recusar|evite)\b/i;
const IMPERATIVE = /^\s*(?:[-*]\s*)?(?:\d+\.\s*)?(run|execute|read|cat|open|write|append|edit|modify|copy|send|upload|post)\b/i;

/** A skill about attacking systems contains attack commands. That is its subject, not its intent. */
function isSecuritySubject(skill) {
  const haystack = `${skill.name} ${skill.meta.description ?? ""}`;
  return /pentest|penetration|security testing|privilege escalation|privesc|exploit|red team|ethical hacking|vulnerab|forensic|malware/i.test(haystack);
}

/** A skill whose stated job is to edit agent configuration is allowed to say so. */
function declaresConfigWork(skill) {
  return /\b(config|configuration|settings|CLAUDE\.md|memory|preferences|hooks?)\b/i.test(skill.meta.description ?? "");
}

function checkDanger(skill, add) {
  const securitySubject = isSecuritySubject(skill);
  const configSkill = declaresConfigWork(skill);

  for (const file of skill.files) {
    const all = lines(file.text);
    all.forEach((line, i) => {
      const isCommand = inFence(all, i) || /^\s*[$>]\s/.test(line);
      const ordered = isCommand || IMPERATIVE.test(line);
      for (const [pattern, severity, why] of DANGER) {
        if (!pattern.test(line)) continue;

        // "Do not generate an .npmrc with an auth token" is a warning, not an attack.
        if (NEGATED.test(line)) continue;
        // Naming a risk in prose is not a step telling anyone to run it.
        if (!ordered) continue;

        let level = severity;
        let note = "";
        if (severity === "critical" && securitySubject) {
          level = "medium";
          note = " (subject matter of this skill — read it, do not auto-veto it)";
        }
        if (severity === "critical" && configSkill && /CLAUDE\.md|settings|\.claude\//i.test(line)) {
          level = "high";
          note = " (its description declares config work)";
        }
        add("danger", level, `${file.rel}:${i + 1} ${why}${note}: \`${line.trim().slice(0, 90)}\``);
      }
    });
  }
}

const FRAMEWORKS = [
  ["next", /Next\.?js\s+v?(\d{1,2})/i],
  ["react", /React\s+v?(\d{1,2})\b/i],
  ["prisma", /Prisma\s+v?(\d{1,2})\b/i],
  ["tailwindcss", /Tailwind(?:\s+CSS)?\s+v?(\d{1,2})/i],
  ["@angular/core", /Angular\s+v?(\d{1,2})/i],
  ["vue", /Vue\s+v?(\d{1,2})/i],
];

function checkVersionDrift(skill, add, project) {
  if (!project) return;
  const pkgPath = join(project, "package.json");
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Fences hold shell snippets like `prisma/schema.prisma 2>/dev/null`, which is not "Prisma 2".
  const prose = skill.text
    .split(/\r?\n/)
    .filter((line, i, all) => !inFence(all, i) && !/^\s*```/.test(line))
    .join("\n");

  for (const [dep, pattern] of FRAMEWORKS) {
    const installed = deps[dep];
    if (!installed) continue;
    const localMajor = Number((installed.match(/(\d{1,2})\./) ?? [])[1]);
    const source = new RegExp(pattern.source + "(\\+?)", "gi");
    const claims = [...prose.matchAll(source)].map((m) => ({ major: Number(m[1]), floor: m[2] === "+" }));
    if (!localMajor || !claims.length) continue;

    // "Next.js 14+" is a floor: only a wrong claim if the project is older than that.
    const hard = claims.filter((c) => !c.floor);
    const floors = claims.filter((c) => c.floor);
    if (floors.length && !hard.length) {
      const highest = Math.max(...floors.map((c) => c.major));
      if (localMajor < highest) {
        add("version-drift", "high", `Requires ${dep} ${highest}+, project runs ${installed}.`);
      }
      continue;
    }
    if (!hard.length) continue;

    const nearest = hard.map((c) => c.major).reduce((a, b) => (Math.abs(b - localMajor) < Math.abs(a - localMajor) ? b : a));
    const gap = Math.abs(nearest - localMajor);
    if (gap >= 2) {
      add("version-drift", "high", `Targets ${dep} ${nearest} — this project runs ${installed}. The API differs.`);
    } else if (gap === 1) {
      add("version-drift", "medium", `Targets ${dep} ${nearest}, project runs ${installed}.`);
    }
  }
}

function checkProvenance(skill, add) {
  if (!skill.origin) {
    add("provenance", "low", "No .origin.json — where this came from is not recorded.");
    return;
  }
  if (!skill.origin.license && !skill.origin.licenca) {
    add("provenance", "medium", `${skill.origin.repo} declares no license; redistribution is legally unclear.`);
  }
}

// ------------------------------------------------------------- overlap

const STOP = new Set(
  ("the and for with when this that you your use using should from into are can its their they them not all any via each such more most other than then asks ask user users task tasks tool tools code file files skill skills claude agent").split(" ")
);

function tokens(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function installedSkills() {
  if (!existsSync(SKILLS)) return [];
  const out = [];
  for (const name of readdirSync(SKILLS)) {
    const file = join(SKILLS, name, "SKILL.md");
    if (!existsSync(file)) continue;
    const meta = frontmatter(readFileSync(file, "utf8"));
    out.push({ name, description: meta.description ?? "", tokens: tokens(`${name} ${meta.description ?? ""}`) });
  }
  return out;
}

function checkOverlap(skill, add, installed) {
  const mine = new Set(tokens(`${skill.name} ${skill.meta.description ?? ""}`));
  if (!mine.size) return null;
  const corpus = installed.filter((s) => s.name !== skill.name);
  const freq = new Map();
  for (const other of corpus) for (const t of new Set(other.tokens)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const idf = (t) => Math.log((corpus.length + 1) / ((freq.get(t) ?? 0) + 1));

  let best = null;
  for (const other of corpus) {
    const theirs = new Set(other.tokens);
    let shared = 0;
    let union = 0;
    for (const t of new Set([...mine, ...theirs])) {
      const w = idf(t);
      union += w;
      if (mine.has(t) && theirs.has(t)) shared += w;
    }
    const score = union ? shared / union : 0;
    if (!best || score > best.score) best = { name: other.name, score };
  }
  if (best && best.score >= 0.25) {
    add("overlap", "low", `Covers the same ground as \`${best.name}\` (${(best.score * 100).toFixed(0)}%). Bench them before keeping both.`);
  }
  return best;
}

// ---------------------------------------------------------------- report

function analyze(dir, options) {
  const skill = readSkill(dir);
  const findings = [];
  const add = (axis, severity, message) => findings.push({ axis, severity, message });
  const installed = options.installed ?? installedSkills();

  checkMetadata(skill, add);
  checkDeadReferences(skill, add);
  checkPhantomSkills(skill, add, new Set(installed.map((s) => s.name)));
  const size = checkSubstance(skill, add);
  checkDanger(skill, add);
  checkVersionDrift(skill, add, options.project);
  checkProvenance(skill, add);
  const twin = checkOverlap(skill, add, installed);

  const critical = findings.filter((f) => f.severity === "critical");
  const score = Math.max(0, 100 - findings.reduce((sum, f) => sum + WEIGHT[f.severity], 0));

  // Auto-veto exists for exactly one class: a skill that would act against its operator.
  // Everything else is a recommendation, because a strange-looking skill can still be right.
  let verdict;
  if (critical.length) verdict = "REJECT";
  else if (twin && twin.score >= 0.25) verdict = "BENCH";
  else if (score >= 75) verdict = "PROMOTE";
  else if (score >= 50) verdict = "REVIEW";
  else verdict = "REJECT";

  return { skill: skill.name, dir, verdict, score, autoVeto: critical.length > 0, findings, size, twin, origin: skill.origin };
}

function print(result) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  console.log(`\n${result.skill}  —  ${result.verdict} (${result.score}/100)`);
  if (result.origin) {
    console.log(`  from ${result.origin.repo} ★${result.origin.estrelas ?? result.origin.stars ?? "?"}`);
  }
  console.log(`  ${result.size.content} content lines, ${result.size.code} of them code (${(result.size.ratio * 100).toFixed(0)}%)`);
  if (result.autoVeto) console.log("  AUTO-VETO: a critical finding overrides the score.");
  if (!result.findings.length) {
    console.log("  nothing found.");
    return;
  }
  console.log("");
  for (const f of [...result.findings].sort((a, b) => order[a.severity] - order[b.severity])) {
    console.log(`  [${f.severity.padEnd(8)}] ${f.axis}: ${f.message}`);
  }
}

// ---------------------------------------------------------------- entry

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

let targets = [];
if (flag("--all")) {
  targets = existsSync(QUARANTINE)
    ? readdirSync(QUARANTINE).map((d) => join(QUARANTINE, d)).filter((d) => existsSync(join(d, "SKILL.md")))
    : [];
} else if (flag("--installed")) {
  targets = readdirSync(SKILLS).map((d) => join(SKILLS, d)).filter((d) => existsSync(join(d, "SKILL.md")));
} else {
  targets = argv.filter((a) => !a.startsWith("--") && a !== value("--project"));
}

if (!targets.length) {
  console.error("Usage: analyze.mjs <skill-dir> [--project <dir>] [--json] | --all | --installed");
  process.exit(1);
}

const options = { project: value("--project"), installed: installedSkills() };
const results = targets.map((t) => analyze(t, options));

if (flag("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  results.sort((a, b) => a.score - b.score).forEach(print);
  if (results.length > 1) {
    const by = (v) => results.filter((r) => r.verdict === v).length;
    console.log(`\n${results.length} analyzed — ${by("PROMOTE")} promote, ${by("BENCH")} bench, ${by("REVIEW")} review, ${by("REJECT")} reject\n`);
  }
}
