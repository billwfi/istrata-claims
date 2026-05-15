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
  const { name, affiliateId, address, city, state, zip, providerIds, userIds } = await req.json()

  const location = await db.$transaction(async (tx: Tx) => {
    const updated = await tx.location.update({
      where: { id },
      data: { name, affiliateId, address, city, state, zip },
    })

    if (providerIds !== undefined) {
      await tx.locationProvider.deleteMany({ where: { locationId: id } })
      if (providerIds.length > 0) {
        await tx.locationProvider.createMany({
          data: providerIds.map((pid: string) => ({ locationId: id, providerId: pid })),
        })
      }
    }

    if (userIds !== undefined) {
      await tx.userLocation.deleteMany({ where: { locationId: id } })
      if (userIds.length > 0) {
        await tx.userLocation.createMany({
          data: userIds.map((uid: string) => ({ locationId: id, userId: uid })),
        })
      }
    }

    return updated
  })

  return NextResponse.json(location)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  await db.location.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
