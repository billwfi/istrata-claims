import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getNbmSqlPasswordFromCookies } from "@/lib/nbm-db-session"
import { getNbmPool, sql } from "@/lib/nbm-sql"
import { NextRequest, NextResponse } from "next/server"
import { devPatients, applyDevFallback } from "@/lib/dev-data"

const LIVE_NBM_ELIGIBILITY_PREFIX = "nbm-live-eligibility-"
const LIVE_NBM_ELIGIBILITY_SOURCE = "iStrata.vw_Full_Eligibility"
const LIVE_ELIGIBILITY_SOURCE_KEY_SQL = `
  CONVERT(varchar(64), HASHBYTES('SHA2_256', CONCAT(
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.category))), ''), ''),
    '|',
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.groupid))), ''), ''),
    '|',
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), e.[Employee ID]))), ''), ''),
    '|',
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), e.[Customer Account Number]))), ''), ''),
    '|',
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), e.profileid))), ''), ''),
    '|',
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), e.insuranceid))), ''), '')
  )), 2)
`
const NBM_CONTRACT_BENEFIT_ELIGIBILITY_GROUP_SQL = `
  AND EXISTS (
    SELECT 1
    FROM iStrata.dbo.is_group_contracts c
    INNER JOIN iStrata.dbo.is_groups g ON g.id = c.group_id
    INNER JOIN iStrata.dbo.is_contract_benefits nbm
      ON nbm.contract_id = c.id
     AND nbm.benefit_type = 'NBM'
    WHERE NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), g.GroupId))), '') =
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.groupid))), '')
      AND (
        c.ContractStatus IS NULL
        OR LOWER(CONVERT(nvarchar(80), c.ContractStatus)) NOT IN ('inactive', 'expired', 'terminated', 'cancelled', 'canceled')
      )
  )
`

type PatientSearchResult = {
  id: string
  firstName: string | null
  lastName: string | null
  dob?: Date | string | null
  memberId?: string | null
  employeeId?: string | null
  email?: string | null
  phone?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  groupId?: string | null
  groupName?: string | null
  supplementAllowance?: number | null
  supplementDiscount?: number | null
  eligibilityObjectId?: string | null
  source?: string
  sourceKey?: string | null
}

function cleanValue(value: unknown) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function liveEligibilityId(sourceKey: unknown) {
  return `${LIVE_NBM_ELIGIBILITY_PREFIX}${encodeURIComponent(String(sourceKey || "").trim())}`
}

function liveEligibilityObjectId(sourceKey: unknown) {
  return `live:${String(sourceKey || "").trim()}`
}

function mapLiveEligibilityPatient(row: Record<string, unknown>): PatientSearchResult {
  const sourceKey = cleanValue(row.sourceKey)
  return {
    id: liveEligibilityId(sourceKey),
    firstName: cleanValue(row.firstName),
    lastName: cleanValue(row.lastName),
    dob: row.dob as Date | string | null,
    memberId: cleanValue(row.memberId),
    employeeId: cleanValue(row.employeeId),
    email: cleanValue(row.email),
    phone: cleanValue(row.phone),
    address1: cleanValue(row.address1),
    address2: cleanValue(row.address2),
    city: cleanValue(row.city),
    state: cleanValue(row.state),
    zip: cleanValue(row.zip),
    groupId: cleanValue(row.groupId),
    groupName: cleanValue(row.groupName),
    supplementAllowance: row.supplementAllowance == null ? null : Number(row.supplementAllowance),
    supplementDiscount: row.supplementDiscount == null ? null : Number(row.supplementDiscount),
    eligibilityObjectId: liveEligibilityObjectId(sourceKey),
    source: LIVE_NBM_ELIGIBILITY_SOURCE,
    sourceKey,
  }
}

function patientDedupeKey(row: PatientSearchResult) {
  return [
    row.groupId || "",
    row.memberId || "",
    row.employeeId || "",
    row.firstName || "",
    row.lastName || "",
    row.dob ? String(row.dob).slice(0, 10) : "",
  ].join("|").toLowerCase()
}

function liveEligibilitySearchMode(q: string) {
  const raw = q.trim()
  if (!raw) return { mode: "all" as const, value: "", first: "", last: "" }

  const tokens = raw.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2 && !raw.includes("@")) {
    return { mode: "nameParts" as const, value: raw, first: tokens[0], last: tokens.slice(1).join(" ") }
  }
  if (raw.includes("@")) return { mode: "email" as const, value: raw, first: "", last: "" }
  if (/\d/.test(raw)) return { mode: "identifier" as const, value: raw, first: "", last: "" }
  return { mode: "name" as const, value: raw, first: "", last: "" }
}

async function searchLiveEligibilityPatients(pool: sql.ConnectionPool, q: string) {
  const search = liveEligibilitySearchMode(q)
  const request = pool.request()
    .input("searchMode", sql.NVarChar(20), search.mode)
    .input("q", sql.NVarChar(255), search.value ? `%${search.value}%` : "")
    .input("first", sql.NVarChar(120), search.first ? `%${search.first}%` : "")
    .input("last", sql.NVarChar(120), search.last ? `%${search.last}%` : "")

  const result = await request
    .query(`
      SELECT TOP 50
        keyset.sourceKey,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[Employee ID]))), '') AS employeeId,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.insuranceid))), '') AS insuranceId,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.profileid))), '') AS profileId,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[Customer Account Number]))), '') AS customerAccountNumber,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[First Name]))), '') AS firstName,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[Last Name]))), '') AS lastName,
        CAST(NULL AS date) AS dob,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.insuranceid))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[Employee ID]))), ''),
          keyset.sourceKey
        ) AS memberId,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), e.personalemailaddress))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), e.[Work Email]))), '')
        ) AS email,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(50), e.Phone))), '') AS phone,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), e.Address1))), '') AS address1,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), e.Address2))), '') AS address2,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.city))), '') AS city,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(50), e.state))), '') AS state,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(20), e.Zip))), '') AS zip,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.groupid))), '') AS groupId,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), e.[group]))), '') AS groupName,
        CAST(NULL AS decimal(12,2)) AS supplementAllowance,
        CAST(NULL AS decimal(12,2)) AS supplementDiscount
      FROM iStrata.dbo.vw_Full_Eligibility e
      CROSS APPLY (
        SELECT ${LIVE_ELIGIBILITY_SOURCE_KEY_SQL} AS sourceKey
      ) keyset
      WHERE keyset.sourceKey IS NOT NULL
        AND (
          @searchMode = 'all'
          OR (@searchMode = 'name' AND (e.[First Name] LIKE @q OR e.[Last Name] LIKE @q))
          OR (
            @searchMode = 'nameParts'
            AND (
              (e.[First Name] LIKE @first AND e.[Last Name] LIKE @last)
              OR (e.[First Name] LIKE @last AND e.[Last Name] LIKE @first)
            )
          )
          OR (@searchMode = 'email' AND (e.personalemailaddress LIKE @q OR e.[Work Email] LIKE @q))
          OR (
            @searchMode = 'identifier'
            AND e.[Employee ID] LIKE @q
          )
        )
        AND (
          e.[Account Status] IS NULL
          OR LOWER(LTRIM(RTRIM(CONVERT(nvarchar(80), e.[Account Status])))) NOT IN ('inactive', 'terminated')
        )
        AND (
          e.recordstatus IS NULL
          OR LOWER(LTRIM(RTRIM(CONVERT(nvarchar(80), e.recordstatus)))) NOT IN ('inactive', 'terminated')
        )
        ${NBM_CONTRACT_BENEFIT_ELIGIBILITY_GROUP_SQL}
      ORDER BY e.[Last Name] ASC, e.[First Name] ASC, e.[Customer Account Number] ASC
    `)

  return result.recordset.map(mapLiveEligibilityPatient)
}

async function searchNbmEligibilityPatients(q: string) {
  const pool = await getNbmPool(await getNbmSqlPasswordFromCookies())
  const combined = await searchLiveEligibilityPatients(pool, q)

  const seen = new Set<string>()
  return combined.filter((row) => {
    const key = patientDedupeKey(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 50)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q") || ""
  const includeNbmEligibility = req.nextUrl.searchParams.get("includeNbmEligibility") === "1"

  const localPatients = await (async () => {
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

  let nbmEligibilityPatients: PatientSearchResult[] = []

  try {
    nbmEligibilityPatients = includeNbmEligibility ? await searchNbmEligibilityPatients(q) : []
  } catch (err) {
    if (err instanceof Error && err.message === "Missing SQL Server environment variables") {
      return NextResponse.json(
        { error: "NBM SQL password required", code: "NBM_SQL_PASSWORD_REQUIRED" },
        { status: 428 }
      )
    }

    throw err
  }

  const patients = [...nbmEligibilityPatients, ...localPatients].slice(0, 50)

  return NextResponse.json(patients)
}

