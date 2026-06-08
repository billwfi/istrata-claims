import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { NewRxOrderForm } from "@/components/rx/NewRxOrderForm"
import { findDevLocation, applyDevFallback } from "@/lib/dev-data"

export default async function NewRxOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session) redirect("/login")

  const isAdmin = session.user.role === "ADMIN"

  const location = await (async () => {
    try {
      const location = await db.location.findUnique({
        where: { id },
        include: { affiliate: true },
      })

      if (!location) return null

      if (!isAdmin) {
        const access = await db.userLocation.findUnique({
          where: { userId_locationId: { userId: session.user.id, locationId: id } },
        })
        if (!access) redirect("/locations")
      }

      return location
    } catch (err) {
      applyDevFallback("new rx page", err)
      return findDevLocation(id)
    }
  })()

  if (!location) notFound()

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/locations" className="hover:text-blue-600">
            Locations
          </Link>
          <span>/</span>
          <Link href={`/locations/${id}`} className="hover:text-blue-600">
            {location.name}
          </Link>
          <span>/</span>
          <span>New RX Order</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Submit RX Order</h1>
        <p className="text-gray-500">
          {location.name} - {location.affiliate.name}
        </p>
      </div>

      <NewRxOrderForm locationId={id} />
    </div>
  )
}

