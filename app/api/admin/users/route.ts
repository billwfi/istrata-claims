import { auth } from "@/lib/auth"
import { db, type Tx } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"

async function requireAdmin() {
  const session = await auth()
  return session?.user.role === "ADMIN" ? session : null
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const q = req.nextUrl.searchParams.get("q") || ""
  const users: Array<Record<string, unknown>> = await db.user.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    include: {
      affiliate: true,
      userLocations: { include: { location: true } },
    },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(users.map((u: Record<string, unknown>) => ({ ...u, password: undefined })))
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name, email, password, role, affiliateId, locationIds } = await req.json()
  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password required" }, { status: 400 })
  }
  const hashed = await bcrypt.hash(password, 10)
  const user = await db.$transaction(async (tx: Tx) => {
    const created = await tx.user.create({
      data: { name, email, password: hashed, role: role || "PROVIDER", affiliateId },
    })
    if (locationIds?.length) {
      await tx.userLocation.createMany({
        data: locationIds.map((lid: string) => ({ userId: created.id, locationId: lid })),
      })
    }
    return created
  })
  return NextResponse.json({ ...user, password: undefined }, { status: 201 })
}
