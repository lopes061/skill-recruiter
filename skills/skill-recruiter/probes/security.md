# Probe: find the hole (security track)

Read the snippet below and write the report at `side-N/output.md`.

```ts
// app/api/cars/[id]/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return Response.json({ error: "no session" }, { status: 401 })
  const car = await prisma.car.findUnique({
    where: { id: params.id },
    include: { customer: true, workOrders: true },
  })
  return Response.json(car)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return Response.json({ error: "no session" }, { status: 401 })
  const body = await req.json()
  const car = await prisma.car.update({ where: { id: params.id }, data: body })
  return Response.json(car)
}
```

Context: a multi-branch CRM. Every user belongs to one branch and one role.
A salesperson sees only their own branch. A manager sees a region. The owner sees everything.

Report: one finding per line, with severity, what breaks in practice, and the fix.
Order, depth and severity criteria: the skill decides.
