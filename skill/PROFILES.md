# Profiles — what each skill *delivers*

`CATALOG.md` says what a skill **promises**. This file says what it **delivered** when it was put
to the test, and it is what breaks a tie when two skills cover the same ground.

Two frontend skills do "the same thing" and come out opposite: one delivers a correct, bland
layout, the other delivers a piece with an opinion. Neither is wrong — they serve different
situations. The router has to know which is which, and that only exists here.

## Format

```
## exact-skill-name
- delivers: the result in one sentence. Concrete, not praise.
- use when: the situation where this result is the right one.
- avoid when: the situation where it gets in the way.
- measured: bench YYYY-MM-DD, probe <id>, beat <skill> | no — read from the description, untested
```

`measured: no` means the author's claim, not a fact. Only a bench changes that field.
`bench.mjs verdict` writes the section for you; "use when" and "avoid when" are left for a human,
because they are judgment, not script output.

---

## Example entries

## nextjs-app-router-patterns
- delivers: authorization in its own module that the query is forced to cross; list and count in a single round trip; a composite index matched to the `orderBy`; warns that `contains` skips the index.
- use when: any App Router route that reads a database — listing, URL filters, pagination, a screen with a tenancy rule.
- avoid when: a standalone React component with no server involved.
- measured: bench 2026-09-22, probe nextjs, beat two rival Next.js skills (both archived).

## prisma-expert
- delivers: a Prisma playbook by symptom — schema and explicit relations, safe migrations, N+1 and `select`, connection pooling on serverless, transactions with isolation.
- use when: touching the schema, creating a migration, a query pulling too many rows, pooler connection errors.
- avoid when: the problem is raw SQL, indexing or `EXPLAIN` — that is the Postgres skill.
- measured: no — read end to end, no bench. Nothing installed competed with it.
