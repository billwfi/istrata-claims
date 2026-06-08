import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin } from "lucide-react"
import { devLocations, applyDevFallback } from "@/lib/dev-data"

export default async function LocationsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const isAdmin = session.user.role === "ADMIN"

  // Admins see all locations; providers see only their assigned locations
  const locations = await (async () => {
    try {
      return isAdmin
        ? await db.location.findMany({
            include: { affiliate: true },
            orderBy: [{ affiliate: { name: "asc" } }, { name: "asc" }],
          })
        : await db.location.findMany({
            where: {
              userLocations: { some: { userId: session.user.id } },
            },
            include: { affiliate: true },
            orderBy: [{ affiliate: { name: "asc" } }, { name: "asc" }],
          })
    } catch (err) {
      applyDevFallback("locations page", err)
      return devLocations
    }
  })()

  // If user has exactly one location, auto-redirect there
  if (locations.length === 1) {
    redirect(`/locations/${locations[0].id}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Select a Location</h1>
        <p className="text-gray-500 mt-1">Choose a location to view and submit claims</p>
      </div>

      {locations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No locations are assigned to your account. Contact your administrator.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location: typeof locations[0]) => (
            <Link key={location.id} href={`/locations/${location.id}`}>
              <Card className="hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <MapPin className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{location.name}</CardTitle>
                      <CardDescription>{location.affiliate.name}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {(location.address || location.city) && (
                  <CardContent className="pt-0 text-sm text-gray-500">
                    {[location.address, location.city, location.state, location.zip]
                      .filter(Boolean)
                      .join(", ")}
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

