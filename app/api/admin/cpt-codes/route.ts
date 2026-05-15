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
  const serviceTypeId = req.nextUrl.searchParams.get("serviceTypeId") || ""
  const codes = await db.cptCode.findMany({
    where: {
      ...(serviceTypeId ? { serviceTypeId } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { serviceType: true },
    orderBy: { code: "asc" },
  })
  return NextResponse.json(codes)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { code, description, serviceTypeId } = await req.json()
  if (!code || !description || !serviceTypeId) {
    return NextResponse.json({ error: "Code, description, and serviceTypeId required" }, { status: 400 })
  }
  const cpt = await db.cptCode.create({ data: { code, description, serviceTypeId } })
  return NextResponse.json(cpt, { status: 201 })
}
