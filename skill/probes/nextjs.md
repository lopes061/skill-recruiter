# Probe: listing route in the App Router (nextjs track)

Write the code and the explanation at `side-N/output.md`, one fenced block per file with its path
in the block header.

Screen: **a rental fleet listing**, Next.js App Router, TypeScript, Prisma.

The page needs:
- filters by branch and by status (available / rented / in service / sold), reflected in the URL
- search by plate or model that fires on click — not on every keystroke
- pagination, 20 per page
- a shareable link: opening the URL with filters reproduces the same list
- 90% of users open it on a phone

Project rule: a user belongs to one branch and one role. A salesperson sees only their own branch.
The list must never return a car from another branch.

Available Prisma model (trimmed):

```prisma
model Car {
  id        String   @id @default(cuid())
  plate     String   @unique
  model     String
  status    String
  branchId  String
  branch    Branch   @relation(fields: [branchId], references: [id])
  daysIdle  Int
  updatedAt DateTime @updatedAt
}
```

Deliver the page, whatever it calls to fetch data, and the loading and error handling.

Left open on purpose — this is what the bench measures: where data is fetched, what is a Server
Component and what is a Client Component, caching and revalidation strategy, file layout, where the
tenancy rule is enforced, and how loading appears.

Close with at most 10 lines explaining why it split things that way.
