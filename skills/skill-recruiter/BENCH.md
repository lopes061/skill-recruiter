# The bench — how a skill gets proven

Two to four skills, one probe, the results side by side with no names in sight. The operator
chooses on visual tracks; measurable criteria decide on objective ones. What the winner delivers
becomes a section in `PROFILES.md`, and that is what the router reads next time.

A star count measures popularity, not results. The bench exists because the two come apart: a skill
with eight thousand stars can produce a layout that reads like a template, and one with sixty can
be exactly what you wanted. Stars pick who enters the test. They never decide who stays.

## The cycle

```
search GitHub  →  quarantine  →  analyze  →  bench  →  profile  →  active
                                                 ↓
                                              archive
```

Nothing reaches the skills directory without passing through. A fetched skill lives in quarantine,
which is not on the load path. A rejected one goes to the archive with its verdict, and comes back
with one command if you change your mind.

## Steps

**1. Set up**

```bash
node scripts/bench.mjs setup visual <skillA> <skillB> --probe visual-mobile
```

Creates `<bench>/<date>-<probe>-<A>-x-<B>/` with one `side-N/` per skill, `PROBE.md`, and a
`.map.json` holding which side is which. Four sides maximum: past that nobody compares by looking.

The draw is blind on purpose. Knowing the name before looking contaminates the choice, especially
when one of the two is the one you have used for months.

**2. Run each side isolated**

One agent per side. Each loads **one** skill, reads `PROBE.md`, and writes into `side-N/` —
`index.html` for a visual probe, `output.md` for text or code.

Each agent must be forbidden to: load the router skill, read another `side-*` folder, open another
skill's `SKILL.md`, read the project repository, or name its skill inside the output. Without those
the test stops being blind, or stops being isolated.

Dispatch every agent in the same message. Running two skills in one context makes the second copy
the first, and the bench then measures order instead of quality.

**3. Compare**

```bash
node scripts/bench.mjs compare <folder> --open
```

Side by side in the browser, with 390px / 768px / full width, a stack toggle and a theme toggle.
Judge a visual probe at phone width first.

**4. Decide — who judges depends on the track**

Objective track (backend, database, query, cache, security, typing, tests): the verdict comes from
measurable criteria, in this order — safer, then faster, then better practice. The operator gets
the result and the reasoning, not two blocks of code to diff.

Visual track: the operator decides, looking. Taste is not measurable by script.

Mixed probe: judge the code on criteria, and show the operator only the rendered visual of the
winner.

**5. Record**

```bash
node scripts/bench.mjs verdict <folder> --winner <skill> \
  --delivers "typographic weight, warm palette, restrained motion"
```

Add `--keep-all` when both stay. That is the most common outcome on aesthetic tracks: the loser did
not lose, it delivers something else. One comes out correct and bland, the other opinionated. Both
get profiles, and the router starts choosing by situation instead of by score.

**6. Clean up**

```bash
node scripts/shelf.mjs archive <loser> --reason "..." --lost-to <winner>
node scripts/shelf.mjs promote <winner>
```

`promote` refuses a skill with no section in `PROFILES.md`. A skill with no profile goes in blind
and the router is back to guessing — which is the problem the bench exists to solve. Use
`--no-profile` for the obvious case: a skill that competes with nothing and fills a plain gap.

## Probes that ship

| id | track | what it measures |
|---|---|---|
| `visual` | visual | first screen of a product page: type, color, rhythm, proof of the product |
| `visual-mobile` | visual | list screen at 390px: density, cards, empty state, touch targets |
| `data` | data | four indicators, a series and a breakdown: chart choice, palette, legends |
| `code` | code | a component with state: architecture, state coverage, typing, accessibility |
| `security` | security | find the hole in a multi-tenant API route: depth, severity, the fix |
| `nextjs` | nextjs | a listing route: cache, server vs client, where the tenancy rule lives |

Probes leave color, typography and architecture open **on purpose**. What a skill fills in by
itself is exactly what the bench is measuring.

A new probe is one more file in `probes/`. The filename is the id.

## When to skip the bench

- A skill that competes with nothing and fills an obvious gap — a framework you did not cover.
  Promote with `--no-profile` and write the profile the first time it does real work.
- A skill that is a command reference rather than a judgment. There is nothing to compare.

Never skip it on an aesthetic track. That is where "they do the same thing" misleads the most.
