import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 50,
  })

  return NextResponse.json(patients)
}
