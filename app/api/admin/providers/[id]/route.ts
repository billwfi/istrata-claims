import { auth } from "@/lib/auth"
import { db, type Tx } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

async function requireAdmin() {
  const session = await auth()
  return session?.user.role === "ADMIN" ? session : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const { name, npi, specialty, locationIds } = await req.json()

  const provider = await db.$transaction(async (tx: Tx) => {
    const updated = await tx.provider.update({ where: { id }, data: { name, npi, specialty } })
    if (locationIds !== undefined) {
      await tx.locationProvider.deleteMany({ where: { providerId: id } })
      if (locationIds.length > 0) {
        await tx.locationProvider.createMany({
          data: locationIds.map((lid: string) => ({ providerId: id, locationId: lid })),
        })
      }
    }
    return updated
  })

  return NextResponse.json(provider)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  await db.provider.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
