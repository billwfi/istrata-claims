import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const q = req.nextUrl.searchParams.get("q") || ""
  const affiliates = await db.affiliate.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    include: { _count: { select: { locations: true, users: true } } },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(affiliates)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name } = await req.json()
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  const affiliate = await db.affiliate.create({ data: { name } })
  return NextResponse.json(affiliate, { status: 201 })
}
