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
    COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), e.insuranceid))), ''), ''),
    '|',
    COALESCE(CONVERT(nvarchar(10), TRY_CONVERT(date, e.DOB), 23), '')
  )), 2)
`
const ACTIVE_NBM_ELIGIBILITY_GROUP_SQL = `
  AND (
    EXISTS (
      SELECT 1
      FROM iStrata.dbo.is_group_contracts c
      INNER JOIN iStrata.dbo.is_groups g ON g.id = c.group_id
      INNER JOIN iStrata.dbo.is_contract_benefits nbm
        ON nbm.contract_id = c.id
       AND nbm.benefit_type = 'NBM'
      WHERE NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), g.GroupId))), '') =
            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.groupid))), '')
        AND (c.ContractStartDate IS NULL OR CAST(c.ContractStartDate AS date) <= CAST(GETDATE() AS date))
        AND (c.ContractEndDate IS NULL OR CAST(c.ContractEndDate AS date) >= CAST(GETDATE() AS date))
        AND (
          c.ContractStatus IS NULL
          OR LOWER(CONVERT(nvarchar(80), c.ContractStatus)) NOT IN ('inactive', 'expired', 'terminated', 'cancelled', 'canceled')
        )
    )
    OR EXISTS (
      SELECT 1
      FROM dbo.nbm_program_rules r
      WHERE r.active = 1
        AND NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), r.group_id))), '') =
            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.groupid))), '')
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

function mapCopiedEligibilityPatient(row: Record<string, unknown>): PatientSearchResult {
  const eligibilityObjectId = cleanValue(row.eligibilityObjectId) || cleanValue(row.id) || ""
  return {
    id: `nbm-eligibility-${eligibilityObjectId}`,
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
    eligibilityObjectId,
    source: "nbm_full_eligibility",
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

async function searchLiveEligibilityPatients(pool: sql.ConnectionPool, q: string) {
  const search = `%${q}%`
  const result = await pool.request()
    .input("q", sql.NVarChar(255), search)
    .input("hasQuery", sql.Bit, Boolean(q.trim()))
    .query(`
      SELECT TOP 50
        keyset.sourceKey,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[Employee ID]))), '') AS employeeId,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.insuranceid))), '') AS insuranceId,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.profileid))), '') AS profileId,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[Customer Account Number]))), '') AS customerAccountNumber,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[First Name]))), '') AS firstName,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), e.[Last Name]))), '') AS lastName,
        TRY_CONVERT(date, e.DOB) AS dob,
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
        TRY_CONVERT(decimal(12,2), e.[Supplement Allowance]) AS supplementAllowance,
        TRY_CONVERT(decimal(12,2), e.[Supplement Discount]) AS supplementDiscount
      FROM iStrata.dbo.vw_Full_Eligibility e
      CROSS APPLY (
        SELECT ${LIVE_ELIGIBILITY_SOURCE_KEY_SQL} AS sourceKey
      ) keyset
      WHERE keyset.sourceKey IS NOT NULL
        AND (
          @hasQuery = 0
          OR CONVERT(nvarchar(100), e.[First Name]) LIKE @q
          OR CONVERT(nvarchar(100), e.[Last Name]) LIKE @q
          OR CONCAT(CONVERT(nvarchar(100), e.[First Name]), ' ', CONVERT(nvarchar(100), e.[Last Name])) LIKE @q
          OR CONCAT(CONVERT(nvarchar(100), e.[Last Name]), ' ', CONVERT(nvarchar(100), e.[First Name])) LIKE @q
          OR CONVERT(nvarchar(255), e.personalemailaddress) LIKE @q
          OR CONVERT(nvarchar(255), e.[Work Email]) LIKE @q
          OR CONVERT(nvarchar(100), e.[Employee ID]) LIKE @q
          OR CONVERT(nvarchar(100), e.insuranceid) LIKE @q
          OR CONVERT(nvarchar(100), e.profileid) LIKE @q
          OR CONVERT(nvarchar(100), e.[Customer Account Number]) LIKE @q
        )
        AND (
          e.[Account Status] IS NULL
          OR LOWER(LTRIM(RTRIM(CONVERT(nvarchar(80), e.[Account Status])))) NOT IN ('inactive', 'terminated')
        )
        AND (
          e.recordstatus IS NULL
          OR LOWER(LTRIM(RTRIM(CONVERT(nvarchar(80), e.recordstatus)))) NOT IN ('inactive', 'terminated')
        )
        ${ACTIVE_NBM_ELIGIBILITY_GROUP_SQL}
      ORDER BY e.[Last Name] ASC, e.[First Name] ASC, e.[Customer Account Number] ASC
    `)

  return result.recordset.map(mapLiveEligibilityPatient)
}

async function searchCopiedEligibilityPatients(pool: sql.ConnectionPool, q: string) {
  const search = `%${q}%`
  const result = await pool.request()
    .input("q", sql.NVarChar(255), search)
    .input("hasQuery", sql.Bit, Boolean(q.trim()))
    .query(`
      SELECT TOP 50
        CONVERT(nvarchar(100), id) AS eligibilityObjectId,
        first_name AS firstName,
        last_name AS lastName,
        dob,
        COALESCE(NULLIF(insurance_id, ''), NULLIF(employee_id, ''), source_key) AS memberId,
        employee_id AS employeeId,
        COALESCE(NULLIF(personal_email, ''), NULLIF(work_email, '')) AS email,
        phone,
        address1,
        address2,
        city,
        state,
        zip,
        group_id AS groupId,
        group_name AS groupName,
        supplement_allowance AS supplementAllowance,
        supplement_discount AS supplementDiscount
      FROM dbo.nbm_full_eligibility
      WHERE (
          @hasQuery = 0
          OR first_name LIKE @q
          OR last_name LIKE @q
          OR CONCAT(first_name, ' ', last_name) LIKE @q
          OR CONCAT(last_name, ' ', first_name) LIKE @q
          OR personal_email LIKE @q
          OR work_email LIKE @q
          OR employee_id LIKE @q
          OR insurance_id LIKE @q
          OR profile_id LIKE @q
        )
        AND (
          record_status IS NULL
          OR record_status NOT IN ('Inactive', 'Terminated')
        )
      ORDER BY last_name ASC, first_name ASC, id DESC
    `)

  return result.recordset.map(mapCopiedEligibilityPatient)
}

async function searchNbmEligibilityPatients(q: string) {
  const pool = await getNbmPool(await getNbmSqlPasswordFromCookies())
  const combined: PatientSearchResult[] = []
  let firstError: unknown = null

  for (const searcher of [searchLiveEligibilityPatients, searchCopiedEligibilityPatients]) {
    try {
      combined.push(...await searcher(pool, q))
    } catch (err) {
      if (!firstError) firstError = err
      console.warn("NBM eligibility search source unavailable", err instanceof Error ? err.message : err)
    }
  }

  if (!combined.length && firstError) throw firstError

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

