#!/usr/bin/env node
// The bench: run one probe through 2–4 skills and put the results side by side, blind.
//
//   node bench.mjs setup <track> <skillA> <skillB> [skillC skillD] [--probe <id>]
//   node bench.mjs compare <folder> [--mode visual|text] [--open]
//   node bench.mjs reveal <folder>
//   node bench.mjs verdict <folder> --winner <skill> --delivers "..." [--keep-all]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { basename, join } from "node:path";
import { BENCH, PROBES, PROFILES } from "./paths.mjs";

function setup(argv) {
  const [track, ...skills] = positional(argv);
  if (!track || skills.length < 2) die("Usage: setup <track> <skillA> <skillB> [skillC skillD] [--probe <id>]");
  if (skills.length > 4) die("Four sides maximum. Past that nobody compares by looking — split it into two rounds.");

  const probeId = option(argv, "--probe") ?? track;
  const probeFile = join(PROBES, `${probeId}.md`);
  if (!existsSync(probeFile)) {
    const available = existsSync(PROBES) ? readdirSync(PROBES).map((f) => basename(f, ".md")).join(", ") : "(none)";
    die(`No probe named "${probeId}". Available: ${available}`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const folder = join(BENCH, `${date}-${probeId}-${skills.join("-x-")}`);

  // Blind: the order is drawn and only `reveal` tells you which side is which.
  const shuffled = [...skills];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const map = { track, probe: probeId, sides: shuffled.length, created: new Date().toISOString() };
  shuffled.forEach((skill, i) => {
    mkdirSync(join(folder, `side-${i + 1}`), { recursive: true });
    map[`side-${i + 1}`] = skill;
  });
  writeFileSync(join(folder, ".map.json"), JSON.stringify(map, null, 2) + "\n");
  writeFileSync(join(folder, "PROBE.md"), readFileSync(probeFile, "utf8"));
  writeFileSync(
    join(folder, "HOW-TO-RUN.md"),
    [
      "# Running this bench",
      "",
      `Probe: \`${probeId}\` · track: \`${track}\` · ${shuffled.length} sides`,
      "",
      "One agent per side. Each agent loads **one** skill, reads `PROBE.md`, writes into `side-N/`",
      "(`index.html` for a visual probe, `output.md` for text or code).",
      "",
      "Each agent must also be forbidden to: load the router skill, read another `side-*` folder,",
      "open another skill's SKILL.md, read the project repository, or name the skill in its output.",
      "Without that the test stops being blind, or stops being isolated.",
      "",
      "Dispatch every agent in the same message. Running two skills in one context makes the second",
      "copy the first, and then the bench measures order instead of quality.",
      "",
      "Then: `node bench.mjs compare <this folder> --open`.",
      "",
    ].join("\n")
  );

  console.log(`Bench ready: ${folder}`);
  console.log(`  ${shuffled.length} sides · probe ${probeId} · names drawn and hidden`);
  console.log(`\nNext: node bench.mjs compare ${folder} --open`);
}

function compare(argv) {
  const folder = positional(argv)[0];
  if (!folder || !existsSync(folder)) die("Pass the bench folder.");
  const map = JSON.parse(readFileSync(join(folder, ".map.json"), "utf8"));

  const names = readdirSync(folder)
    .filter((d) => /^side-\d+$/.test(d))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));

  const sides = names.map((side) => {
    const html = join(folder, side, "index.html");
    const md = join(folder, side, "output.md");
    if (existsSync(html)) return { side, mode: "visual", file: `${side}/index.html` };
    if (existsSync(md)) return { side, mode: "text", content: readFileSync(md, "utf8") };
    die(`${side} is empty. Run the probe on that side before comparing.`);
  });

  const mode = option(argv, "--mode") ?? sides[0].mode;
  const target = join(folder, "comparison.html");
  writeFileSync(target, page(sides, mode, map));
  console.log(`Page: ${target}`);

  if (argv.includes("--open")) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
      execFileSync(opener, [target]);
      console.log("Opened. Judge by looking — the names are hidden.");
    } catch {
      console.log("Could not open a browser. Open the file by hand.");
    }
  }
}

const escape = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(sides, mode, map) {
  const panel = (s) =>
    mode === "visual" && s.mode === "visual"
      ? `<iframe src="${s.file}" title="${s.side}"></iframe>`
      : `<pre>${escape(s.content ?? "(HTML output; use --mode visual)")}</pre>`;

  const columns = sides
    .map((s, i) => `<section><div class="label">SIDE ${i + 1}</div><div class="stage">${panel(s)}</div></section>`)
    .join("\n  ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bench ${map.probe}</title>
<style>
  :root {
    --bg: #f4f2ee; --paper: #fbfaf8; --ink: #1c1a17; --muted: #6b655c;
    --rule: #dcd7cf; --accent: #0f5f52; --columns: ${sides.length};
    --curve: cubic-bezier(.22, 1, .36, 1);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #14130f; --paper: #1c1a16; --ink: #ece7dd; --muted: #948d81;
      --rule: #302c26; --accent: #5fd1b8;
    }
  }
  :root[data-theme="dark"] {
    --bg: #14130f; --paper: #1c1a16; --ink: #ece7dd; --muted: #948d81;
    --rule: #302c26; --accent: #5fd1b8;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif; }
  header {
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap; padding: 12px 16px;
    border-bottom: 1px solid var(--rule); background: var(--paper); position: sticky; top: 0; z-index: 2;
  }
  h1 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; margin: 0; color: var(--muted); font-weight: 600; }
  .group { display: flex; gap: 6px; margin-left: auto; }
  button {
    font: inherit; font-size: 12px; padding: 5px 11px; border: 1px solid var(--rule); background: transparent;
    color: var(--ink); border-radius: 6px; cursor: pointer;
    transition: border-color .18s var(--curve), color .18s var(--curve);
  }
  button:hover, button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
  main { display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); gap: 1px; background: var(--rule); min-height: calc(100vh - 54px); }
  section { background: var(--bg); display: flex; flex-direction: column; min-width: 0; }
  .label {
    padding: 8px 16px; font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em;
    color: var(--muted); border-bottom: 1px solid var(--rule); background: var(--paper); position: sticky; top: 54px;
  }
  .stage { flex: 1; display: flex; justify-content: center; overflow: auto; padding: 16px; }
  iframe { width: 100%; max-width: var(--width, 100%); height: 100%; min-height: 70vh; border: 1px solid var(--rule); background: var(--paper); border-radius: 8px; }
  pre { width: 100%; margin: 0; padding: 14px; overflow: auto; background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
  body.stacked main { grid-template-columns: 1fr; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>Bench · probe ${map.probe} · track ${map.track}</h1>
  <div class="group">
    <button data-width="390">390px</button>
    <button data-width="768">768px</button>
    <button data-width="0" aria-pressed="true">full</button>
    <button id="stack">stack</button>
    <button id="theme">theme</button>
  </div>
</header>
<main>
  ${columns}
</main>
<script>
  const widths = [...document.querySelectorAll("[data-width]")];
  widths.forEach((b) => b.addEventListener("click", () => {
    widths.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    const v = Number(b.dataset.width);
    document.documentElement.style.setProperty("--width", v ? v + "px" : "100%");
  }));
  document.getElementById("stack").addEventListener("click", (e) => {
    const on = document.body.classList.toggle("stacked");
    e.currentTarget.setAttribute("aria-pressed", String(on));
  });
  document.getElementById("theme").addEventListener("click", () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  });
</script>
</body>
</html>
`;
}

function reveal(argv) {
  const folder = positional(argv)[0];
  const map = JSON.parse(readFileSync(join(folder, ".map.json"), "utf8"));
  for (const [key, value] of Object.entries(map)) if (key.startsWith("side-")) console.log(`${key} = ${value}`);
}

function verdict(argv) {
  const folder = positional(argv)[0];
  const winner = option(argv, "--winner");
  const delivers = option(argv, "--delivers");
  if (!folder || !winner || !delivers) die('Usage: verdict <folder> --winner <skill> --delivers "what it delivers" [--keep-all]');

  const map = JSON.parse(readFileSync(join(folder, ".map.json"), "utf8"));
  const all = Object.entries(map).filter(([k]) => k.startsWith("side-")).map(([, v]) => v);
  if (!all.includes(winner)) die(`"${winner}" was not in this bench. It had: ${all.join(", ")}`);
  const losers = all.filter((s) => s !== winner);
  const keepAll = argv.includes("--keep-all");
  const date = new Date().toISOString().slice(0, 10);

  writeFileSync(
    join(folder, "VERDICT.md"),
    [
      `# ${all.join(" × ")}`,
      "",
      `- date: ${date}`,
      `- probe: ${map.probe} (track ${map.track})`,
      ...all.map((_, i) => `- side-${i + 1}: ${map[`side-${i + 1}`]}`),
      `- chosen: ${winner}`,
      `- what the winner delivers: ${delivers}`,
      `- the others: ${keepAll ? `${losers.join(", ")} stay — they deliver something else, not something worse` : `archive ${losers.join(", ")}`}`,
      "",
    ].join("\n")
  );

  appendFileSync(
    PROFILES,
    [
      "",
      `## ${winner}`,
      `- delivers: ${delivers}`,
      `- use when: (fill in — the situation where this result is the right one)`,
      `- avoid when: (fill in)`,
      `- measured: bench ${date}, probe ${map.probe}, beat ${losers.join(", ")}`,
      "",
    ].join("\n")
  );

  console.log(`Verdict: ${join(folder, "VERDICT.md")}`);
  console.log(`PROFILES.md gained a "## ${winner}" section — fill in "use when" and "avoid when".`);
  if (!keepAll) {
    console.log("\nArchive the others:");
    for (const loser of losers) {
      console.log(`  node shelf.mjs archive ${loser} --reason "lost probe ${map.probe}" --lost-to ${winner}`);
    }
  } else {
    console.log(`\n${losers.join(", ")} stay. Give them profiles too, or the router cannot tell them apart.`);
  }
}

function positional(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      if (!["--keep-all", "--open"].includes(argv[i])) i++;
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
const table = { setup, compare, reveal, verdict };
if (!table[command]) {
  console.error("Commands: setup | compare | reveal | verdict");
  process.exit(1);
}
table[command](rest);
