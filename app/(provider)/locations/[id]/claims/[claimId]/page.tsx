import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge"
import { format } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; claimId: string }>
}) {
  const { id, claimId } = await params
  const session = await auth()
  if (!session) redirect("/login")

  const isAdmin = session.user.role === "ADMIN"

  const claim = await db.claim.findUnique({
    where: { id: claimId, locationId: id },
    include: {
      patient: true,
      provider: true,
      serviceType: true,
      location: { include: { affiliate: true } },
      submittedBy: { select: { name: true, email: true } },
      claimCptCodes: { include: { cptCode: true } },
      claimDiagnosisCodes: {
        include: { diagnosisCode: true },
        orderBy: { sequence: "asc" },
      },
    },
  })

  if (!claim) notFound()

  if (!isAdmin) {
    const access = await db.userLocation.findUnique({
      where: { userId_locationId: { userId: session.user.id, locationId: id } },
    })
    if (!access) redirect("/locations")
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/locations" className="hover:text-blue-600">Locations</Link>
          <span>/</span>
          <Link href={`/locations/${id}`} className="hover:text-blue-600">
            {claim.location.name}
          </Link>
          <span>/</span>
          <span>Claim {claim.id.slice(-8).toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            Claim #{claim.id.slice(-8).toUpperCase()}
          </h1>
          <ClaimStatusBadge status={claim.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Claim Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Detail label="Patient" value={`${claim.patient.lastName}, ${claim.patient.firstName}`} />
            {claim.patient.dob && (
              <Detail label="Date of Birth" value={format(new Date(claim.patient.dob), "MM/dd/yyyy")} />
            )}
            {claim.patient.memberId && (
              <Detail label="Member ID" value={claim.patient.memberId} />
            )}
            <Detail label="Provider" value={claim.provider.name} />
            {claim.provider.npi && <Detail label="NPI" value={claim.provider.npi} />}
            <Detail label="Service Type" value={claim.serviceType.name} />
            <Detail label="Date of Service" value={format(new Date(claim.dateOfService), "MM/dd/yyyy")} />
            <Detail label="Location" value={`${claim.location.name} — ${claim.location.affiliate.name}`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Submission Info</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Detail label="Status" value={<ClaimStatusBadge status={claim.status} />} />
            <Detail label="Submitted By" value={`${claim.submittedBy.name} (${claim.submittedBy.email})`} />
            <Detail
              label="Submitted At"
              value={claim.submittedAt ? format(new Date(claim.submittedAt), "MM/dd/yyyy h:mm a") : "Not submitted"}
            />
            <Detail label="Created" value={format(new Date(claim.createdAt), "MM/dd/yyyy")} />
            {claim.notes && <Detail label="Notes" value={claim.notes} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>CPT Codes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CPT Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claim.claimCptCodes.map((cc: typeof claim.claimCptCodes[0]) => (
                <TableRow key={cc.id}>
                  <TableCell className="font-mono font-medium">{cc.cptCode.code}</TableCell>
                  <TableCell>{cc.cptCode.description}</TableCell>
                  <TableCell>{cc.units}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Diagnosis Codes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sequence</TableHead>
                <TableHead>ICD-10 Code</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claim.claimDiagnosisCodes.map((dc: typeof claim.claimDiagnosisCodes[0]) => (
                <TableRow key={dc.id}>
                  <TableCell>
                    {dc.sequence === 1 ? "Primary" : `Secondary ${dc.sequence}`}
                  </TableCell>
                  <TableCell className="font-mono font-medium">{dc.diagnosisCode.code}</TableCell>
                  <TableCell>{dc.diagnosisCode.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right max-w-xs">{value}</span>
    </div>
  )
}
