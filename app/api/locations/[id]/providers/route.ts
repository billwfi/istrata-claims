import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { devProviders, findDevLocation, applyDevFallback } from "@/lib/dev-data"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q") || ""

  const providers = await (async () => {
    try {
      return await db.provider.findMany({
        where: {
          locationProviders: { some: { locationId: id } },
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { npi: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        take: 50,
      })
    } catch (err) {
      applyDevFallback("location providers api", err)
      if (!findDevLocation(id)) return []

      const normalized = q.toLowerCase()
      return devProviders.filter((provider) =>
        !normalized ||
        provider.name.toLowerCase().includes(normalized) ||
        provider.npi?.toLowerCase().includes(normalized)
      )
    }
  })()

  return NextResponse.json(providers)
}

