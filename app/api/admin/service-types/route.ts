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
  const serviceTypes = await db.serviceType.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    include: { _count: { select: { cptCodes: true, claims: true } } },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(serviceTypes)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name, description } = await req.json()
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  const serviceType = await db.serviceType.create({ data: { name, description } })
  return NextResponse.json(serviceType, { status: 201 })
}
