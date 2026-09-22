# Skill Recruiter

Português: [README.pt-BR.md](README.pt-BR.md)

A router and a curator for Claude Code skills. It picks the right skills for a task, and it keeps
the shelf they live on honest.

Installing skills is easy. Knowing which of them is any good is not. A catalog tells you what a
skill *promises*. This tells you what it *delivers*.

```
search GitHub  →  quarantine  →  analyze  →  bench  →  profile  →  active
                                                 ↓
                                              archive
```

Nothing reaches your skills directory without passing through. A fetched skill lands in quarantine,
which is not on the load path. A rejected one goes to the archive with its verdict, and comes back
with one command.

## Why

A skill is instructions your agent obeys. That makes the usual signals weak:

- **Stars measure popularity, not results.** An eight-thousand-star skill can produce a layout that
  reads like a template. One with sixty can be exactly what you wanted.
- **Descriptions are the author praising their own work.** Two skills with near-identical
  descriptions routinely deliver opposite results.
- **Nobody reads what they install.** A `SKILL.md` can point at files that were never shipped, defer
  to skills you do not have, or tell the agent to run something destructive.

Auditing 97 installed skills with this tool: **13 promised files that do not exist** (one referenced
34 of them), and **22 had no content of their own** — checklists with nothing to check, or stubs
deferring to skills that were not installed.

## Install

Requires Node 18+ and git. `gh` is optional but recommended for GitHub search.

```bash
git clone https://github.com/lopes061/skill-recruiter.git
cd skill-recruiter
./install.sh
```

The installer copies `skill/` into your skills directory as `skill-recruiter`. Paths resolve in this
order: `$SKILLS_HOME`, `~/.claude/skills`, `~/.claude-shared/skills`. Quarantine and archive are
created next to whichever is found.

Then restart Claude Code and ask it to route a task, or run the scripts directly.

## Make it run on every prompt

The router is only useful if it fires before you start working, not after. Two ways:

**A line in `CLAUDE.md`** — the simple one, works everywhere:

```markdown
Before any technical task — writing code, touching UI, reviewing, testing, database work —
invoke `skill-recruiter` with the task as the argument. It reads the catalog, composes the
stack (four skills at most, in the right order) and shows the choice before executing.

Skip it only for: a plain question, a harness command, conversation, or when I name a skill myself.
```

Keep the skip list. Without it the router fires on "what does this file do?" and wastes a turn.

**A `UserPromptSubmit` hook** — for when you want it enforced rather than suggested. In
`~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "echo 'Route through skill-recruiter before technical work.'" }
        ]
      }
    ]
  }
}
```

The hook injects the reminder into every prompt. The `CLAUDE.md` line is advice the model can weigh;
the hook is text it always receives. Start with the line — most setups never need the hook.

## Commands

```bash
# find
node scripts/discover.mjs search "prisma database"
node scripts/discover.mjs inspect microsoft/playwright --filter component
node scripts/discover.mjs fetch microsoft/playwright packages/.../playwright-trace

# read
node scripts/analyze.mjs --all                        # everything in quarantine
node scripts/analyze.mjs --installed --project ~/app  # audit what is already active

# prove
node scripts/bench.mjs setup visual skill-a skill-b --probe visual-mobile
node scripts/bench.mjs compare <folder> --open
node scripts/bench.mjs verdict <folder> --winner skill-a --delivers "..."

# keep the shelf clean
node scripts/shelf.mjs list
node scripts/shelf.mjs overlap
node scripts/shelf.mjs promote <name>
node scripts/shelf.mjs archive <name> --reason "..."
```

## What `analyze` checks

| axis | what it catches |
|---|---|
| dead reference | the skill tells the model to open a file it never shipped |
| phantom dependency | it delegates to skills that are not installed here |
| substance | checklists with nothing to check; "use @other-skill" stubs; claims with no example |
| danger | destructive commands, credential reads, harness-configuration edits |
| version drift | it targets a major version your project does not run |
| overlap | it covers ground something installed already covers |

**Auto-veto applies to one class only: a skill that would act against its operator.** Everything
else is a recommendation, because a strange-looking skill can still be the right one. Three
calibrations, each of which came from a false positive on real data:

- A negated line is a warning, not an attack. "Do **not** generate an `.npmrc` with an auth token"
  is the skill protecting you.
- A skill about attacking systems contains attack commands. That is its subject; the finding drops
  to medium with a note instead of vetoing.
- A skill whose description declares configuration work is allowed to say it edits configuration.

Naming a risk in prose is not a step telling you to run it, so findings only fire from commands and
imperatives.

## The bench

Two to four skills, one probe, results side by side with the names hidden.

**Blind** — the order is drawn at setup. Knowing which is the incumbent contaminates the choice.

**Isolated** — one agent per side, dispatched together, none able to see the others' work. Running
two skills in one context makes the second copy the first, and then you are measuring order.

**Judged by track** — objective tracks (backend, database, security, typing, tests) are decided on
measurable criteria: safer, then faster, then better practice. Visual tracks are decided by the
person looking at the screen, at phone width first.

`--keep-all` is the most common outcome on aesthetic tracks. The loser did not lose; it delivers
something else. Both stay, both get profiles, and the router starts choosing by situation.

Six probes ship with it: `visual`, `visual-mobile`, `data`, `code`, `security`, `nextjs`. Each one
leaves color, typography and architecture open on purpose — what a skill fills in by itself is what
is being measured. A new probe is one more file in `probes/`.

## Files

```
skill/
├─ SKILL.md            the skill itself: routing, discovery, analysis, bench, shelf
├─ BENCH.md            the full bench protocol
├─ CATALOG.md          what each installed skill promises   (example — replace)
├─ PROFILES.md         what each one delivered              (example — replace)
├─ probes/             the probes a bench can run
└─ scripts/
   ├─ paths.mjs        where skills live on this machine
   ├─ discover.mjs     search · inspect · fetch
   ├─ analyze.mjs      read a skill end to end, report on six axes
   ├─ bench.mjs        setup · compare · reveal · verdict
   └─ shelf.mjs        list · overlap · promote · archive · restore
```

## License

MIT.
