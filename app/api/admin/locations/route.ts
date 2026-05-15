import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

async function requireAdmin() {
  const session = await auth()
  return session?.user.role === "ADMIN" ? session : null
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const q = req.nextUrl.searchParams.get("q") || ""
  const locations = await db.location.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }] } : {},
    include: { affiliate: true, _count: { select: { claims: true } } },
    orderBy: [{ affiliate: { name: "asc" } }, { name: "asc" }],
  })
  return NextResponse.json(locations)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name, affiliateId, address, city, state, zip } = await req.json()
  if (!name || !affiliateId) return NextResponse.json({ error: "Name and affiliateId required" }, { status: 400 })
  const location = await db.location.create({
    data: { name, affiliateId, address, city, state, zip },
    include: { affiliate: true },
  })
  return NextResponse.json(location, { status: 201 })
}
