import { auth } from "@/lib/auth"
import { db, type Tx } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const claims = await db.claim.findMany({
    where: { locationId: id },
    include: {
      patient: true,
      provider: true,
      serviceType: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(claims)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { patientId, providerId, serviceTypeId, dateOfService, notes, status, cptLines, diagnosisLines } = body

  if (!patientId || !providerId || !serviceTypeId || !dateOfService) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const claim = await db.$transaction(async (tx: Tx) => {
    const newClaim = await tx.claim.create({
      data: {
        locationId: id,
        patientId,
        providerId,
        serviceTypeId,
        dateOfService: new Date(dateOfService),
        notes: notes || null,
        status: status || "DRAFT",
        submittedById: session.user.id,
        submittedAt: status === "SUBMITTED" ? new Date() : null,
      },
    })

    if (cptLines?.length) {
      await tx.claimCptCode.createMany({
        data: cptLines.map((l: { cptCodeId: string; units: number }) => ({
          claimId: newClaim.id,
          cptCodeId: l.cptCodeId,
          units: l.units || 1,
        })),
      })
    }

    if (diagnosisLines?.length) {
      await tx.claimDiagnosisCode.createMany({
        data: diagnosisLines.map((l: { diagnosisCodeId: string; sequence: number }, i: number) => ({
          claimId: newClaim.id,
          diagnosisCodeId: l.diagnosisCodeId,
          sequence: l.sequence || i + 1,
        })),
      })
    }

    return newClaim
  })

  return NextResponse.json(claim, { status: 201 })
}
