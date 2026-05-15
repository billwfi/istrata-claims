import { auth } from "@/lib/auth"
import { db, type Tx } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"

async function requireAdmin() {
  const session = await auth()
  return session?.user.role === "ADMIN" ? session : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const { name, email, password, role, affiliateId, locationIds } = await req.json()

  const user = await db.$transaction(async (tx: Tx) => {
    const data: Record<string, unknown> = { name, email, role, affiliateId }
    if (password) data.password = await bcrypt.hash(password, 10)

    const updated = await tx.user.update({ where: { id }, data })

    if (locationIds !== undefined) {
      await tx.userLocation.deleteMany({ where: { userId: id } })
      if (locationIds.length > 0) {
        await tx.userLocation.createMany({
          data: locationIds.map((lid: string) => ({ userId: id, locationId: lid })),
        })
      }
    }

    return updated
  })

  return NextResponse.json({ ...user, password: undefined })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  await db.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
