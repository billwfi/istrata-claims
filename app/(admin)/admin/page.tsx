import { db } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, MapPin, Users, Stethoscope, UserRound, FileText } from "lucide-react"

export default async function AdminDashboard() {
  const [affiliates, locations, users, providers, patients, claims] = await Promise.all([
    db.affiliate.count(),
    db.location.count(),
    db.user.count(),
    db.provider.count(),
    db.patient.count(),
    db.claim.count(),
  ])

  const stats = [
    { label: "Affiliates", value: affiliates, icon: Building2, href: "/admin/affiliates" },
    { label: "Locations", value: locations, icon: MapPin, href: "/admin/locations" },
    { label: "Users", value: users, icon: Users, href: "/admin/users" },
    { label: "Providers", value: providers, icon: Stethoscope, href: "/admin/providers" },
    { label: "Patients", value: patients, icon: UserRound, href: "/admin/patients" },
    { label: "Total Claims", value: claims, icon: FileText, href: "/locations" },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:border-blue-400 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-gray-500">
                  <stat.icon className="h-4 w-4" />
                  <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
