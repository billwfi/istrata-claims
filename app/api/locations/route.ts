import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"
import { devLocations, applyDevFallback } from "@/lib/dev-data"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = session.user.role === "ADMIN"

  const locations = await (async () => {
    try {
      return isAdmin
        ? await db.location.findMany({
            include: { affiliate: true },
            orderBy: [{ affiliate: { name: "asc" } }, { name: "asc" }],
          })
        : await db.location.findMany({
            where: { userLocations: { some: { userId: session.user.id } } },
            include: { affiliate: true },
            orderBy: [{ affiliate: { name: "asc" } }, { name: "asc" }],
          })
    } catch (err) {
      applyDevFallback("locations api", err)
      return devLocations
    }
  })()

  return NextResponse.json(locations)
}

