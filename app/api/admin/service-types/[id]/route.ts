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
  const { name, description } = await req.json()
  const st = await db.serviceType.update({ where: { id }, data: { name, description } })
  return NextResponse.json(st)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  await db.serviceType.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
