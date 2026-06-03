import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { devPatients, applyDevFallback } from "@/lib/dev-data"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q") || ""

  const patients = await (async () => {
    try {
      return await db.patient.findMany({
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
    } catch (err) {
      applyDevFallback("patients api", err)
      const normalized = q.toLowerCase()
      return devPatients.filter((patient) =>
        !normalized ||
        patient.firstName.toLowerCase().includes(normalized) ||
        patient.lastName.toLowerCase().includes(normalized) ||
        patient.memberId?.toLowerCase().includes(normalized)
      )
    }
  })()

  return NextResponse.json(patients)
}

