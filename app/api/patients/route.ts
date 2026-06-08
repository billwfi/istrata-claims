import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getNbmSqlPasswordFromCookies } from "@/lib/nbm-db-session"
import { getNbmPool, sql } from "@/lib/nbm-sql"
import { NextRequest, NextResponse } from "next/server"
import { devPatients, applyDevFallback } from "@/lib/dev-data"

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

  let nbmEligibilityPatients = []

  try {
    nbmEligibilityPatients = includeNbmEligibility ? await (async () => {
    try {
      const search = `%${q}%`
      const pool = await getNbmPool(await getNbmSqlPasswordFromCookies())
      const result = await pool.request()
        .input("q", sql.NVarChar(255), search)
        .input("hasQuery", sql.Bit, Boolean(q.trim()))
        .query(`
          SELECT TOP 50
            CONCAT('nbm-eligibility-', CONVERT(varchar(30), id)) AS id,
            first_name AS firstName,
            last_name AS lastName,
            dob,
            COALESCE(NULLIF(insurance_id, ''), NULLIF(employee_id, ''), source_key) AS memberId,
            COALESCE(NULLIF(personal_email, ''), NULLIF(work_email, '')) AS email,
            phone,
            address1,
            address2,
            city,
            state,
            zip,
            group_id AS groupId,
            group_name AS groupName,
            'nbm_eligibility' AS source
          FROM dbo.nbm_full_eligibility
          WHERE (
              @hasQuery = 0
              OR first_name LIKE @q
              OR last_name LIKE @q
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

      return result.recordset
    } catch (err) {
      applyDevFallback("nbm eligibility patients api", err)
      return []
    }
    })() : []
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

