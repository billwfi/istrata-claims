import { auth } from "@/lib/auth"
import { db, type Tx } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

async function requireAdmin() {
  const session = await auth()
  return session?.user.role === "ADMIN" ? session : null
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const q = req.nextUrl.searchParams.get("q") || ""
  const providers = await db.provider.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { npi: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    include: {
      locationProviders: { include: { location: true } },
      _count: { select: { claims: true } },
    },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(providers)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name, npi, specialty, locationIds } = await req.json()
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  const provider = await db.$transaction(async (tx: Tx) => {
    const created = await tx.provider.create({ data: { name, npi, specialty } })
    if (locationIds?.length) {
      await tx.locationProvider.createMany({
        data: locationIds.map((lid: string) => ({ providerId: created.id, locationId: lid })),
      })
    }
    return created
  })
  return NextResponse.json(provider, { status: 201 })
}
