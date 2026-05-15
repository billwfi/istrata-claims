import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

async function requireAdmin() {
  const session = await auth()
  return session?.user.role === "ADMIN" ? session : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const { firstName, lastName, dob, memberId } = await req.json()
  const patient = await db.patient.update({
    where: { id },
    data: { firstName, lastName, dob: dob ? new Date(dob) : null, memberId },
  })
  return NextResponse.json(patient)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  await db.patient.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
