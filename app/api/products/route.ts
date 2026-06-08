import { auth } from "@/lib/auth"
import { getNbmSqlPasswordFromCookies } from "@/lib/nbm-db-session"
import { getNbmPool, sql } from "@/lib/nbm-sql"
import { NextRequest, NextResponse } from "next/server"

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : value
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = (req.nextUrl.searchParams.get("q") || "").trim()
  let pool

  try {
    pool = await getNbmPool(await getNbmSqlPasswordFromCookies())
  } catch (err) {
    if (err instanceof Error && err.message === "Missing SQL Server environment variables") {
      return NextResponse.json(
        { error: "NBM SQL password required", code: "NBM_SQL_PASSWORD_REQUIRED" },
        { status: 428 }
      )
    }

    throw err
  }

  const request = pool.request()

  if (q) {
    request.input("q", sql.NVarChar(120), `%${q}%`)
  }

  const result = await request.query(`
    SELECT TOP 50
      CAST([Record #] AS nvarchar(50)) AS id,
      LTRIM(RTRIM([Item Name])) AS itemName,
      LTRIM(RTRIM([Item SKU])) AS itemSku,
      LTRIM(RTRIM([Item Type])) AS itemType,
      CAST([Retail Cost] AS decimal(12, 2)) AS retailCost,
      CAST([Item Cost] AS decimal(12, 2)) AS itemCost,
      CAST([Copayment Tier] AS decimal(12, 2)) AS copaymentTier,
      LTRIM(RTRIM([Clinical Tier])) AS clinicalTier,
      LTRIM(RTRIM([Product Form Type])) AS productFormType,
      CAST([NAB] AS nvarchar(50)) AS nab
    FROM dbo.NBMProductMaster
    ${q ? "WHERE [Item Name] LIKE @q OR [Item SKU] LIKE @q" : ""}
    ORDER BY [Item Name], [Item SKU]
  `)

  return NextResponse.json(result.recordset.map((row) => ({
    id: clean(row.id),
    itemName: clean(row.itemName),
    itemSku: clean(row.itemSku),
    itemType: clean(row.itemType),
    retailCost: row.retailCost == null ? null : Number(row.retailCost),
    itemCost: row.itemCost == null ? null : Number(row.itemCost),
    copaymentTier: row.copaymentTier == null ? null : Number(row.copaymentTier),
    clinicalTier: clean(row.clinicalTier),
    productFormType: clean(row.productFormType),
    nab: clean(row.nab),
  })))
}
