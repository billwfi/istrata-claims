import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge"
import { Plus, FileText, PackagePlus } from "lucide-react"
import { format } from "date-fns"
import type { ClaimStatus } from "@/lib/generated/prisma/client"
import { findDevLocation, applyDevFallback } from "@/lib/dev-data"

const STATUS_TABS: Array<{ value: string; label: string; status?: ClaimStatus }> = [
  { value: "all", label: "All" },
  { value: "DRAFT", label: "Draft", status: "DRAFT" },
  { value: "SUBMITTED", label: "Submitted", status: "SUBMITTED" },
  { value: "IN_REVIEW", label: "In Review", status: "IN_REVIEW" },
  { value: "APPROVED", label: "Approved", status: "APPROVED" },
  { value: "DENIED", label: "Denied", status: "DENIED" },
  { value: "NEEDS_MORE_INFO", label: "Needs Info", status: "NEEDS_MORE_INFO" },
  { value: "PAID", label: "Paid", status: "PAID" },
]

export default async function LocationClaimsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session) redirect("/login")

  const isAdmin = session.user.role === "ADMIN"

  const { location, claims } = await (async () => {
    try {
      const location = await db.location.findUnique({
        where: { id },
        include: { affiliate: true },
      })

      if (!location) return { location: null, claims: [] }

      // Verify access
      if (!isAdmin) {
        const access = await db.userLocation.findUnique({
          where: { userId_locationId: { userId: session.user.id, locationId: id } },
        })
        if (!access) redirect("/locations")
      }

      const claims = await db.claim.findMany({
        where: { locationId: id },
        include: {
          patient: true,
          provider: true,
          serviceType: true,
          submittedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      })

      return { location, claims }
    } catch (err) {
      applyDevFallback("location detail page", err)
      return { location: findDevLocation(id), claims: [] }
    }
  })()

  if (!location) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/locations" className="hover:text-blue-600">
              Locations
            </Link>
            <span>/</span>
            <span>{location.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{location.name}</h1>
          <p className="text-gray-500">{location.affiliate.name}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/locations/${id}/rx/new`}>
            <Button className="gap-2">
              <PackagePlus className="h-4 w-4" />
              New RX Order
            </Button>
          </Link>
          <Link href={`/locations/${id}/claims/new`}>
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              New Claim
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="flex-wrap h-auto">
          {STATUS_TABS.map((tab) => {
            const count = tab.status
              ? claims.filter((c: typeof claims[0]) => c.status === tab.status).length
              : claims.length
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1">
                {tab.label}
                {count > 0 && (
                  <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {STATUS_TABS.map((tab) => {
          const filtered = tab.status
            ? claims.filter((c: typeof claims[0]) => c.status === tab.status)
            : claims

          return (
            <TabsContent key={tab.value} value={tab.value}>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500 border rounded-lg bg-white">
                  <FileText className="h-10 w-10 mb-3 text-gray-300" />
                  <p>No claims found</p>
                </div>
              ) : (
                <div className="border rounded-lg bg-white overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim ID</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Service Type</TableHead>
                        <TableHead>Date of Service</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((claim: typeof claims[0]) => (
                        <TableRow key={claim.id}>
                          <TableCell>
                            <Link
                              href={`/locations/${id}/claims/${claim.id}`}
                              className="font-mono text-xs text-blue-600 hover:underline"
                            >
                              {claim.id.slice(-8).toUpperCase()}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {claim.patient.lastName}, {claim.patient.firstName}
                          </TableCell>
                          <TableCell>{claim.provider.name}</TableCell>
                          <TableCell>{claim.serviceType.name}</TableCell>
                          <TableCell>
                            {format(new Date(claim.dateOfService), "MM/dd/yyyy")}
                          </TableCell>
                          <TableCell>
                            <ClaimStatusBadge status={claim.status} />
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {claim.submittedAt
                              ? format(new Date(claim.submittedAt), "MM/dd/yyyy")
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

