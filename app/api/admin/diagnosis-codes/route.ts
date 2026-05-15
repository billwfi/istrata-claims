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
  const codes = await db.diagnosisCode.findMany({
    where: q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { code: "asc" },
  })
  return NextResponse.json(codes)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { code, description } = await req.json()
  if (!code || !description) {
    return NextResponse.json({ error: "Code and description required" }, { status: 400 })
  }
  const dc = await db.diagnosisCode.create({ data: { code, description } })
  return NextResponse.json(dc, { status: 201 })
}
