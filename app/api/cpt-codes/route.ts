import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const serviceTypeId = req.nextUrl.searchParams.get("serviceTypeId") || ""
  const q = req.nextUrl.searchParams.get("q") || ""

  const cptCodes = await db.cptCode.findMany({
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
    orderBy: { code: "asc" },
    take: 100,
  })

  return NextResponse.json(cptCodes)
}
