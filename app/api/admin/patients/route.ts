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
  const patients = await db.patient.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { memberId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    include: { _count: { select: { claims: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
  return NextResponse.json(patients)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { firstName, lastName, dob, memberId } = await req.json()
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First and last name required" }, { status: 400 })
  }
  const patient = await db.patient.create({
    data: { firstName, lastName, dob: dob ? new Date(dob) : null, memberId },
  })
  return NextResponse.json(patient, { status: 201 })
}
