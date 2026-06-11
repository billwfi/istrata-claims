import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getNbmSqlPasswordFromCookies } from "@/lib/nbm-db-session"
import { getNbmPool, sql } from "@/lib/nbm-sql"
import { NextRequest, NextResponse } from "next/server"
import { devPatients, devProviders, findDevLocation, applyDevFallback } from "@/lib/dev-data"

interface RxItemInput {
  productId?: string
  productName?: string
  productSku?: string
  dosage?: string
  refillFrequencyDays?: number
  refillDurationMonths?: number
  automaticRefill?: boolean
  copayAmount?: number
  retailCost?: number
  patientPayAmount?: number
  patientPayBasis?: string
  nextFillDate?: string
  processRefillDate?: string
}

const VALID_ORDER_CATEGORIES = new Set(["Initial RX", "Refill"])
const VALID_DELIVERY_METHODS = new Set(["Local", "Mail"])
const VALID_PROGRAM_TYPES = new Set(["PEPM_NBM", "DPC_NBM", "NBM"])
const CONTRACT_BENEFIT_SOURCE_SYSTEM = "iStrata.is_contract_benefits"
const CONTRACT_BENEFIT_REFILL_POLICY_SOURCE = "contract_benefit_refills_allowed"
const CONTRACT_BENEFIT_REFILL_NULL_POLICY_SOURCE = "contract_benefit_null_default_allowed"
const LIVE_NBM_ELIGIBILITY_PREFIX = "nbm-live-eligibility-"
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

interface ResolvedPatient {
  id: string
  firstName: string
  lastName: string
  dob: Date | null
  memberId?: string | null
  eligibilityObjectId?: string | null
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
}

interface LiveContractBenefitRow {
  contract_id: number | string
  contract_record_id?: string | null
  contract_start_date?: Date | string | null
  contract_end_date?: Date | string | null
  contract_status?: string | null
  billing_cycle?: string | null
  group_code?: string | null
  group_name?: string | null
  nbm_benefit_id: number | string
  nbm_type?: string | null
  annual_max_amount?: number | string | null
  nbm_copay_amount?: number | string | null
  refills_allowed?: boolean | number | string | null
  pepm_benefit_id?: number | string | null
  pepm_rate?: number | string | null
  istrata_admin_fee?: number | string | null
  nbm_fee?: number | string | null
}

function getNbmLiveEligibilityKey(value: unknown) {
  const text = String(value || "")
  if (!text.startsWith(LIVE_NBM_ELIGIBILITY_PREFIX)) return null
  const encoded = text.slice(LIVE_NBM_ELIGIBILITY_PREFIX.length)
  if (!encoded) return null
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

function isNbmEligibilityPatientId(value: unknown) {
  return getNbmLiveEligibilityKey(value) != null
}

function liveEligibilityId(sourceKey: unknown) {
  return `${LIVE_NBM_ELIGIBILITY_PREFIX}${encodeURIComponent(String(sourceKey || "").trim())}`
}

function liveEligibilityObjectId(sourceKey: unknown) {
  return `live:${String(sourceKey || "").trim()}`
}

function asDate(value?: string | Date | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function asNumber(value: unknown) {
  if (value === "" || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function getRefillFrequencyDays(value: unknown) {
  const parsed = asNumber(value)
  return parsed && parsed > 0 ? parsed : 30
}

function formatOrderNumber() {
  const now = new Date()
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "")
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `NBM-${stamp}-${suffix}`
}

function renderTemplate(template: string | null, values: Record<string, string>) {
  return (template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || "")
}

function formatMoney(value: number | null) {
  if (value == null) return "unconfigured"
  return `$${Number(value).toFixed(2)}`
}

function getPositiveInt(value: unknown, fallback = 1) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function itemUtilizationAmount(item: RxItemInput) {
  const retailCost = asNumber(item.retailCost)
  if (retailCost == null) return 0
  return retailCost * getPositiveInt((item as RxItemInput & { numberOfBottles?: number }).numberOfBottles, 1)
}

function productCopayAmount(item: RxItemInput, program: NbmProgramRule) {
  if (!program.copayEnabled) return 0
  return asNumber(item.copayAmount) ?? 0
}

interface NbmProgramRule {
  ruleId: string | null
  sourceSystem: string
  sourceObjectId: string | null
  programType: string
  programName: string
  groupId: string | null
  groupName: string | null
  planYearStartMonth: number
  planYearStartDay: number
  annualMaxAmount: number | null
  annualMaxMode: string
  enforcementMode: string
  copayEnabled: boolean
  refillsAllowed: boolean
  refillPolicySource: string
  pepmRate: number | null
  billingFrequency: string | null
  notificationThresholdPercent: number
  patientNotificationEnabled: boolean
  locationNotificationEnabled: boolean
  usedPatientAllowanceFallback: boolean
}

interface BenefitEvaluation {
  status: string
  message: string
  orderUtilization: number
  utilizationBefore: number
  utilizationAfter: number
  remainingAfter: number | null
  annualMaxAmount: number | null
  planYearStart: Date
  planYearEnd: Date
  shouldNotifyMax: boolean
}

interface PatientPricing {
  patientPayAmount: number
  patientPayBasis: string
  pricingMessage: string
}

function retailRequiredForBenefit(benefit: BenefitEvaluation) {
  return benefit.annualMaxAmount != null
    && (
      benefit.utilizationBefore >= benefit.annualMaxAmount
      || benefit.utilizationAfter > benefit.annualMaxAmount
      || benefit.status === "retail_required"
    )
}

function itemPatientPricing(item: RxItemInput, benefit: BenefitEvaluation, program: NbmProgramRule): PatientPricing {
  const retailAmount = itemUtilizationAmount(item)
  if (retailRequiredForBenefit(benefit)) {
    return {
      patientPayAmount: retailAmount,
      patientPayBasis: "retail",
      pricingMessage: `Annual NBM allocation is exhausted or exceeded. Collect retail (${formatMoney(retailAmount)}) instead of copay.`,
    }
  }

  if (!program.copayEnabled) {
    return {
      patientPayAmount: 0,
      patientPayBasis: "no_copay",
      pricingMessage: "Copay is disabled for this NBM program.",
    }
  }

  const copayAmount = productCopayAmount(item, program)
  return {
    patientPayAmount: copayAmount,
    patientPayBasis: "copay",
    pricingMessage: `Collect product copay (${formatMoney(copayAmount)}).`,
  }
}

async function ensureNbmPricingSchema(pool: sql.ConnectionPool) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.nbm_rx_order_items', 'patient_pay_amount') IS NULL
      ALTER TABLE dbo.nbm_rx_order_items ADD patient_pay_amount DECIMAL(12,2) NULL;
    IF COL_LENGTH('dbo.nbm_rx_order_items', 'patient_pay_basis') IS NULL
      ALTER TABLE dbo.nbm_rx_order_items ADD patient_pay_basis NVARCHAR(40) NULL;
    IF COL_LENGTH('dbo.nbm_rx_order_items', 'pricing_message') IS NULL
      ALTER TABLE dbo.nbm_rx_order_items ADD pricing_message NVARCHAR(500) NULL;

    IF COL_LENGTH('dbo.nbm_refill_tasks', 'payment_basis') IS NULL
      ALTER TABLE dbo.nbm_refill_tasks ADD payment_basis NVARCHAR(40) NULL;
    IF COL_LENGTH('dbo.nbm_refill_tasks', 'payment_message') IS NULL
      ALTER TABLE dbo.nbm_refill_tasks ADD payment_message NVARCHAR(500) NULL;
  `)
}

function normalizeProgramType(value: unknown, fallback = "PEPM_NBM") {
  const programType = String(value || "").trim().toUpperCase()
  return VALID_PROGRAM_TYPES.has(programType) ? programType : fallback
}

function cleanValue(value: unknown) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function contractBenefitSourceObjectId(row: LiveContractBenefitRow, programType = "PEPM_NBM") {
  return `contract-benefit:${row.contract_id}:${row.nbm_benefit_id}:${normalizeProgramType(programType)}`
}

function contractBenefitProgramName(row: LiveContractBenefitRow) {
  const recordId = cleanValue(row.contract_record_id)
  const groupName = cleanValue(row.group_name)
  const nbmType = cleanValue(row.nbm_type)
  const suffix = nbmType ? `NBM ${nbmType}` : "NBM Benefit"
  return [recordId, groupName, suffix].filter(Boolean).join(" - ") || "NBM Program"
}

function bitValue(value: unknown) {
  if (value == null) return null
  if (value === true || value === 1 || value === "1") return 1
  if (value === false || value === 0 || value === "0") return 0
  return value ? 1 : 0
}

function contractBenefitRefillsAllowed(row: LiveContractBenefitRow) {
  const explicit = bitValue(row.refills_allowed)
  return explicit == null ? 1 : explicit
}

function contractBenefitNotes(row: LiveContractBenefitRow) {
  const explicitRefills = bitValue(row.refills_allowed)
  return [
    "Synced from live iStrata contract benefits.",
    explicitRefills == null
      ? "RefillsAllowed is null on the contract benefit; defaulted to allowed until reviewed."
      : `RefillsAllowed=${explicitRefills}.`,
    row.nbm_type ? `NBMType=${row.nbm_type}.` : null,
    row.nbm_fee != null ? `NBMFee=${row.nbm_fee}.` : null,
    row.istrata_admin_fee != null ? `IStrataAdminFee=${row.istrata_admin_fee}.` : null,
    row.nbm_copay_amount != null ? `NBMCopayAmount=${row.nbm_copay_amount}.` : null,
  ].filter(Boolean).join(" ")
}

async function getLiveContractBenefitRows(
  pool: sql.ConnectionPool,
  args: { groupId?: string | null; effectiveOn: Date; limit?: number }
): Promise<LiveContractBenefitRow[]> {
  const safeLimit = Math.min(Math.max(Number(args.limit) || 500, 1), 1000)
  const result = await pool.request()
    .input("groupId", sql.NVarChar(100), args.groupId || null)
    .input("effectiveOn", sql.Date, args.effectiveOn)
    .query(`
      SELECT TOP (${safeLimit})
        c.id AS contract_id,
        CONVERT(nvarchar(100), c.RecordID) AS contract_record_id,
        CAST(c.ContractStartDate AS date) AS contract_start_date,
        CAST(c.ContractEndDate AS date) AS contract_end_date,
        CONVERT(nvarchar(80), c.ContractStatus) AS contract_status,
        CONVERT(nvarchar(40), c.BillingCycle) AS billing_cycle,
        CONVERT(nvarchar(100), g.GroupId) AS group_code,
        CONVERT(nvarchar(200), g.GroupName) AS group_name,
        nbm.id AS nbm_benefit_id,
        CONVERT(nvarchar(80), nbm.NBMType) AS nbm_type,
        CAST(nbm.AnnualMaxAllowance AS decimal(12,2)) AS annual_max_amount,
        CAST(nbm.CopayAmount AS decimal(12,2)) AS nbm_copay_amount,
        CAST(nbm.RefillsAllowed AS bit) AS refills_allowed,
        pepm.id AS pepm_benefit_id,
        CAST(pepm.PEPMRate AS decimal(12,4)) AS pepm_rate,
        CAST(pepm.IStrataAdminFee AS decimal(12,4)) AS istrata_admin_fee,
        CAST(pepm.NBMFee AS decimal(12,4)) AS nbm_fee
      FROM iStrata.dbo.is_group_contracts c
      INNER JOIN iStrata.dbo.is_groups g ON g.id = c.group_id
      INNER JOIN iStrata.dbo.is_contract_benefits nbm
        ON nbm.contract_id = c.id
       AND nbm.benefit_type = 'NBM'
      LEFT JOIN iStrata.dbo.is_contract_benefits pepm
        ON pepm.contract_id = c.id
       AND pepm.benefit_type = 'PEPM'
      WHERE (@groupId IS NULL OR g.GroupId = @groupId OR CONVERT(nvarchar(100), c.group_id) = @groupId)
        AND (
          c.ContractStatus IS NULL
          OR LOWER(CONVERT(nvarchar(80), c.ContractStatus)) NOT IN ('inactive', 'expired', 'terminated', 'cancelled', 'canceled')
        )
      ORDER BY
        CASE WHEN LOWER(CONVERT(nvarchar(80), c.ContractStatus)) = 'active' THEN 0 ELSE 1 END,
        CASE
          WHEN (c.ContractStartDate IS NULL OR CAST(c.ContractStartDate AS date) <= @effectiveOn)
           AND (c.ContractEndDate IS NULL OR CAST(c.ContractEndDate AS date) >= @effectiveOn) THEN 0
          WHEN c.ContractStartDate IS NOT NULL AND CAST(c.ContractStartDate AS date) > @effectiveOn THEN 1
          ELSE 2
        END,
        CASE WHEN c.ContractStartDate IS NOT NULL AND CAST(c.ContractStartDate AS date) > @effectiveOn THEN c.ContractStartDate END ASC,
        CASE WHEN c.ContractStartDate IS NULL OR CAST(c.ContractStartDate AS date) <= @effectiveOn THEN c.ContractStartDate END DESC,
        c.id DESC,
        nbm.id DESC
    `)

  return result.recordset as LiveContractBenefitRow[]
}

async function upsertContractBenefitProgramRule(
  pool: sql.ConnectionPool,
  row: LiveContractBenefitRow,
  requestedProgramType = "PEPM_NBM"
) {
  const programType = normalizeProgramType(requestedProgramType)
  const sourceObjectId = contractBenefitSourceObjectId(row, programType)
  const programName = contractBenefitProgramName(row)
  const groupId = cleanValue(row.group_code)
  const groupName = cleanValue(row.group_name)
  const effectiveDate = asDate(row.contract_start_date)
  const endDate = asDate(row.contract_end_date)
  const annualMaxAmount = asNumber(row.annual_max_amount)
  const pepmRate = asNumber(row.pepm_rate)
  const billingFrequency = cleanValue(row.billing_cycle)
  const refillsAllowed = contractBenefitRefillsAllowed(row)
  const notes = contractBenefitNotes(row)

  const update = await pool.request()
    .input("sourceSystem", sql.NVarChar(80), CONTRACT_BENEFIT_SOURCE_SYSTEM)
    .input("sourceObjectId", sql.NVarChar(160), sourceObjectId)
    .input("programType", sql.NVarChar(40), programType)
    .input("programName", sql.NVarChar(200), programName)
    .input("groupId", sql.NVarChar(100), groupId)
    .input("groupName", sql.NVarChar(200), groupName)
    .input("effectiveDate", sql.Date, effectiveDate)
    .input("endDate", sql.Date, endDate)
    .input("active", sql.Bit, true)
    .input("annualMaxAmount", sql.Decimal(12, 2), annualMaxAmount)
    .input("pepmRate", sql.Decimal(12, 4), pepmRate)
    .input("billingFrequency", sql.NVarChar(40), billingFrequency)
    .input("refillsAllowed", sql.Bit, refillsAllowed)
    .input("notes", sql.NVarChar(sql.MAX), notes)
    .query(`
      UPDATE dbo.nbm_program_rules
        SET program_type = @programType,
            program_name = @programName,
            group_id = @groupId,
            group_name = @groupName,
            effective_date = @effectiveDate,
            end_date = @endDate,
            active = @active,
            annual_max_amount = @annualMaxAmount,
            pepm_rate = @pepmRate,
            billing_frequency = @billingFrequency,
            refills_allowed = @refillsAllowed,
            notes = @notes,
            updated_by = 'contract-benefit-sync',
            updated_at = SYSUTCDATETIME()
      OUTPUT inserted.*
      WHERE source_system = @sourceSystem
        AND source_object_id = @sourceObjectId
    `)

  if (update.recordset[0]) return update.recordset[0] as Record<string, unknown>

  const insert = await pool.request()
    .input("sourceSystem", sql.NVarChar(80), CONTRACT_BENEFIT_SOURCE_SYSTEM)
    .input("sourceObjectId", sql.NVarChar(160), sourceObjectId)
    .input("programType", sql.NVarChar(40), programType)
    .input("programName", sql.NVarChar(200), programName)
    .input("groupId", sql.NVarChar(100), groupId)
    .input("groupName", sql.NVarChar(200), groupName)
    .input("effectiveDate", sql.Date, effectiveDate)
    .input("endDate", sql.Date, endDate)
    .input("active", sql.Bit, true)
    .input("annualMaxAmount", sql.Decimal(12, 2), annualMaxAmount)
    .input("pepmRate", sql.Decimal(12, 4), pepmRate)
    .input("billingFrequency", sql.NVarChar(40), billingFrequency)
    .input("refillsAllowed", sql.Bit, refillsAllowed)
    .input("notes", sql.NVarChar(sql.MAX), notes)
    .query(`
      INSERT INTO dbo.nbm_program_rules (
        source_system, source_object_id, program_type, program_name,
        group_id, group_name, effective_date, end_date, active,
        annual_max_amount, pepm_rate, billing_frequency, refills_allowed,
        notes, created_by, updated_by
      )
      OUTPUT inserted.*
      VALUES (
        @sourceSystem, @sourceObjectId, @programType, @programName,
        @groupId, @groupName, @effectiveDate, @endDate, @active,
        @annualMaxAmount, @pepmRate, @billingFrequency, @refillsAllowed,
        @notes, 'contract-benefit-sync', 'contract-benefit-sync'
      )
    `)

  return (insert.recordset[0] as Record<string, unknown> | undefined) || null
}

async function syncContractBenefitProgramRules(
  pool: sql.ConnectionPool,
  args: { groupId?: string | null; effectiveOn?: Date; programType?: string; limit?: number }
) {
  try {
    const rows = await getLiveContractBenefitRows(pool, {
      groupId: args.groupId || null,
      effectiveOn: args.effectiveOn || new Date(),
      limit: args.limit || 500,
    })
    const synced: Record<string, unknown>[] = []
    for (const row of rows) {
      const rule = await upsertContractBenefitProgramRule(pool, row, args.programType || "PEPM_NBM")
      if (rule) synced.push(rule)
    }
    return synced
  } catch (err) {
    console.warn("Unable to sync live iStrata contract benefits for NBM rules", err instanceof Error ? err.message : err)
    return []
  }
}

function planYearWindow(referenceDate: Date, rule: NbmProgramRule) {
  const month = Math.min(Math.max(Number(rule.planYearStartMonth || 1), 1), 12) - 1
  const day = Math.min(Math.max(Number(rule.planYearStartDay || 1), 1), 31)
  let start = new Date(referenceDate.getFullYear(), month, day)
  if (referenceDate < start) start = new Date(referenceDate.getFullYear() - 1, month, day)

  const nextStart = new Date(start)
  nextStart.setFullYear(start.getFullYear() + 1)
  const end = addDays(nextStart, -1)

  return { start, end }
}

function mapProgramRule(row: Record<string, unknown> | undefined, patient: ResolvedPatient): NbmProgramRule {
  const patientAnnualMax = asNumber(patient.supplementAllowance)
  const ruleAnnualMax = row?.annual_max_amount == null ? null : Number(row.annual_max_amount)
  const annualMaxAmount = ruleAnnualMax ?? patientAnnualMax
  const sourceSystem = String(row?.source_system || "runtime")
  const refillBit = bitValue(row?.refills_allowed)

  return {
    ruleId: String(row?.id || "") || null,
    sourceSystem,
    sourceObjectId: row?.source_object_id ? String(row.source_object_id) : null,
    programType: String(row?.program_type || "PEPM_NBM"),
    programName: String(row?.program_name || "Unconfigured PEPM NBM"),
    groupId: row?.group_id ? String(row.group_id) : patient.groupId || null,
    groupName: row?.group_name ? String(row.group_name) : patient.groupName || null,
    planYearStartMonth: Number(row?.plan_year_start_month || 1),
    planYearStartDay: Number(row?.plan_year_start_day || 1),
    annualMaxAmount,
    annualMaxMode: String(row?.annual_max_mode || "retail_dollars"),
    enforcementMode: String(row?.enforcement_mode || "prevent_exceeded"),
    copayEnabled: row?.copay_enabled == null ? true : Boolean(row.copay_enabled),
    refillsAllowed: refillBit == null ? true : refillBit === 1,
    refillPolicySource: sourceSystem === CONTRACT_BENEFIT_SOURCE_SYSTEM
      ? (String(row?.notes || "").includes("RefillsAllowed is null")
        ? CONTRACT_BENEFIT_REFILL_NULL_POLICY_SOURCE
        : CONTRACT_BENEFIT_REFILL_POLICY_SOURCE)
      : "program_rule",
    pepmRate: row?.pepm_rate == null ? null : Number(row.pepm_rate),
    billingFrequency: row?.billing_frequency ? String(row.billing_frequency) : null,
    notificationThresholdPercent: Number(row?.notification_threshold_percent || 100),
    patientNotificationEnabled: row?.patient_notification_enabled == null ? true : Boolean(row.patient_notification_enabled),
    locationNotificationEnabled: row?.location_notification_enabled == null ? true : Boolean(row.location_notification_enabled),
    usedPatientAllowanceFallback: ruleAnnualMax == null && patientAnnualMax != null,
  }
}

async function resolveProgramRule(pool: sql.ConnectionPool, patient: ResolvedPatient, locationId: string, body: Record<string, unknown>, submittedAt: Date) {
  const programType = normalizeProgramType(body.programType || body.program_type || "PEPM_NBM")
  await syncContractBenefitProgramRules(pool, {
    groupId: patient.groupId || null,
    effectiveOn: submittedAt,
    programType,
    limit: 25,
  })

  const result = await pool.request()
    .input("programType", sql.NVarChar(40), programType)
    .input("effectiveOn", sql.Date, submittedAt)
    .input("groupId", sql.NVarChar(100), patient.groupId || null)
    .input("locationId", sql.NVarChar(100), locationId || null)
    .query(`
      SELECT TOP 1 *
      FROM dbo.nbm_program_rules r
      WHERE r.active = 1
        AND r.program_type = @programType
        AND (
          (r.location_id IS NOT NULL AND r.location_id = @locationId)
          OR (r.group_id IS NOT NULL AND r.group_id = @groupId)
          OR (r.location_id IS NULL AND r.group_id IS NULL)
        )
      ORDER BY
        CASE WHEN r.location_id IS NOT NULL AND r.location_id = @locationId THEN 0 ELSE 1 END,
        CASE WHEN r.group_id IS NOT NULL AND r.group_id = @groupId THEN 0 ELSE 1 END,
        CASE
          WHEN r.source_system = '${CONTRACT_BENEFIT_SOURCE_SYSTEM}' THEN 0
          WHEN r.source_system = 'iStrata.is_group_contracts' THEN 1
          WHEN r.source_system = 'system' THEN 9
          ELSE 4
        END,
        CASE
          WHEN (r.effective_date IS NULL OR r.effective_date <= @effectiveOn)
           AND (r.end_date IS NULL OR r.end_date >= @effectiveOn) THEN 0
          WHEN r.effective_date IS NOT NULL AND r.effective_date > @effectiveOn THEN 1
          ELSE 2
        END,
        CASE WHEN r.effective_date IS NOT NULL AND r.effective_date > @effectiveOn THEN r.effective_date END ASC,
        CASE WHEN r.effective_date IS NULL OR r.effective_date <= @effectiveOn THEN r.effective_date END DESC,
        r.created_at DESC
    `)

  return mapProgramRule(result.recordset[0], patient)
}

async function evaluateBenefit(pool: sql.ConnectionPool, patient: ResolvedPatient, items: RxItemInput[], program: NbmProgramRule, submittedAt: Date): Promise<BenefitEvaluation> {
  const planYear = planYearWindow(submittedAt, program)
  const missingRetail = items.some((item) => asNumber(item.retailCost) == null)
  const orderUtilization = items.reduce((sum, item) => sum + itemUtilizationAmount(item), 0)

  const existing = await pool.request()
    .input("programType", sql.NVarChar(40), program.programType)
    .input("planYearStart", sql.Date, planYear.start)
    .input("planYearEnd", sql.Date, planYear.end)
    .input("groupId", sql.NVarChar(100), patient.groupId || null)
    .input("eligibilityObjectId", sql.NVarChar(100), patient.eligibilityObjectId || null)
    .input("patientMemberId", sql.NVarChar(100), patient.memberId || null)
    .input("patientEmployeeId", sql.NVarChar(100), patient.employeeId || null)
    .query(`
      SELECT COALESCE(SUM(utilization_amount), 0) AS annual_utilization
      FROM dbo.nbm_utilization_events
      WHERE voided_at IS NULL
        AND program_type = @programType
        AND plan_year_start = @planYearStart
        AND plan_year_end = @planYearEnd
        AND COALESCE(group_id, '') = COALESCE(@groupId, '')
        AND (
          (@eligibilityObjectId IS NOT NULL AND eligibility_object_id = @eligibilityObjectId)
          OR (@patientMemberId IS NOT NULL AND patient_member_id = @patientMemberId)
          OR (@patientEmployeeId IS NOT NULL AND patient_employee_id = @patientEmployeeId)
        )
    `)

  const annualMax = program.annualMaxAmount == null ? null : Number(program.annualMaxAmount)
  const before = Number(existing.recordset[0]?.annual_utilization || 0)
  const after = before + orderUtilization
  const remaining = annualMax == null ? null : annualMax - after
  const threshold = annualMax == null ? null : annualMax * (Number(program.notificationThresholdPercent || 100) / 100)

  let status = "approved"
  let message = "Benefit validation passed."

  if (annualMax == null) {
    status = "unconfigured"
    message = "No annual max is configured for this patient program; order accepted and flagged for configuration."
  } else if (missingRetail) {
    status = "rejected_missing_retail_cost"
    message = "Retail cost is required to enforce the configured annual NBM maximum."
  } else if (before >= annualMax || after > annualMax) {
    status = "retail_required"
    message = `Annual NBM allocation is exhausted or exceeded (${formatMoney(annualMax)} max). Current used: ${formatMoney(before)}; order retail: ${formatMoney(orderUtilization)}. Patient should pay retail instead of copay.`
  } else if (threshold != null && after >= threshold) {
    status = "max_reached"
    message = `Patient reaches the configured NBM annual threshold (${formatMoney(annualMax)}) with this fill. Future fills should be retail instead of copay.`
  }

  return {
    status,
    message,
    orderUtilization,
    utilizationBefore: before,
    utilizationAfter: after,
    remainingAfter: remaining,
    annualMaxAmount: annualMax,
    planYearStart: planYear.start,
    planYearEnd: planYear.end,
    shouldNotifyMax: status === "max_reached" || status === "retail_required" || status === "flagged_exceeds_annual_max",
  }
}

async function insertUtilizationEvent(
  tx: sql.Transaction,
  args: {
    orderId: string
    itemId: string
    item: RxItemInput
    patient: ResolvedPatient
    program: NbmProgramRule
    benefit: BenefitEvaluation
    createdBy: string
  }
) {
  const utilizationAmount = itemUtilizationAmount(args.item)
  if (utilizationAmount <= 0) return

  await tx.request()
    .input("orderId", sql.UniqueIdentifier, args.orderId)
    .input("itemId", sql.UniqueIdentifier, args.itemId)
    .input("programRuleId", sql.UniqueIdentifier, args.program.ruleId)
    .input("eligibilityObjectId", sql.NVarChar(100), args.patient.eligibilityObjectId || null)
    .input("patientEmployeeId", sql.NVarChar(100), args.patient.employeeId || null)
    .input("patientMemberId", sql.NVarChar(100), args.patient.memberId || null)
    .input("patientFirstName", sql.NVarChar(100), args.patient.firstName || null)
    .input("patientLastName", sql.NVarChar(100), args.patient.lastName || null)
    .input("groupId", sql.NVarChar(100), args.patient.groupId || null)
    .input("groupName", sql.NVarChar(200), args.patient.groupName || null)
    .input("programType", sql.NVarChar(40), args.program.programType)
    .input("programName", sql.NVarChar(200), args.program.programName)
    .input("planYearStart", sql.Date, args.benefit.planYearStart)
    .input("planYearEnd", sql.Date, args.benefit.planYearEnd)
    .input("utilizationAmount", sql.Decimal(12, 2), utilizationAmount)
    .input("retailAmount", sql.Decimal(12, 2), asNumber(args.item.retailCost))
    .input("copayAmount", sql.Decimal(12, 2), asNumber(args.item.copayAmount))
    .input("sourceStatus", sql.NVarChar(40), args.benefit.status)
    .input("payload", sql.NVarChar(sql.MAX), JSON.stringify({
      productName: args.item.productName || null,
      productSku: args.item.productSku || null,
      patientPayAmount: args.item.patientPayAmount ?? null,
      patientPayBasis: args.item.patientPayBasis ?? null,
    }))
    .input("createdBy", sql.NVarChar(100), args.createdBy)
    .query(`
      INSERT INTO dbo.nbm_utilization_events (
        order_id, item_id, program_rule_id,
        eligibility_object_id, patient_employee_id, patient_member_id,
        patient_first_name, patient_last_name, group_id, group_name,
        program_type, program_name, plan_year_start, plan_year_end,
        event_type, utilization_amount, retail_amount, copay_amount, source_status,
        payload_json, created_by
      )
      VALUES (
        @orderId, @itemId, @programRuleId,
        @eligibilityObjectId, @patientEmployeeId, @patientMemberId,
        @patientFirstName, @patientLastName, @groupId, @groupName,
        @programType, @programName, @planYearStart, @planYearEnd,
        'order_submitted', @utilizationAmount, @retailAmount, @copayAmount, @sourceStatus,
        @payload, @createdBy
      )
    `)
}

async function queueImmediateEmail(
  tx: sql.Transaction,
  args: {
    orderId: string
    ruleKey: string
    recipientEmail: string | null
    recipientName: string | null
    values: Record<string, string>
  }
) {
  if (!args.recipientEmail) return null

  const rule = await tx.request()
    .input("ruleKey", sql.NVarChar(80), args.ruleKey)
    .query(`
      SELECT TOP 1 subject_template, body_template
      FROM dbo.nbm_email_rules
      WHERE active = 1 AND rule_key = @ruleKey
    `)
  const template = rule.recordset[0]
  if (!template) return null

  const queued = await tx.request()
    .input("orderId", sql.UniqueIdentifier, args.orderId)
    .input("ruleKey", sql.NVarChar(80), args.ruleKey)
    .input("recipientEmail", sql.NVarChar(255), args.recipientEmail)
    .input("recipientName", sql.NVarChar(200), args.recipientName)
    .input("subject", sql.NVarChar(255), renderTemplate(template.subject_template, args.values))
    .input("body", sql.NVarChar(sql.MAX), renderTemplate(template.body_template, args.values))
    .query(`
      INSERT INTO dbo.nbm_email_queue (
        order_id, rule_key, recipient_email, recipient_name, subject, body, scheduled_for
      )
      OUTPUT inserted.id
      VALUES (@orderId, @ruleKey, @recipientEmail, @recipientName, @subject, @body, SYSUTCDATETIME())
    `)

  return queued.recordset[0]?.id as number | null
}

async function insertBenefitNotification(
  tx: sql.Transaction,
  args: {
    orderId: string
    patient: ResolvedPatient
    program: NbmProgramRule
    benefit: BenefitEvaluation
    recipientType: string
    recipientEmail: string | null
    recipientName: string | null
    emailQueueId: number | null
    createdBy: string
  }
) {
  const patientName = `${args.patient.firstName || ""} ${args.patient.lastName || ""}`.trim()

  await tx.request()
    .input("orderId", sql.UniqueIdentifier, args.orderId)
    .input("programRuleId", sql.UniqueIdentifier, args.program.ruleId)
    .input("eligibilityObjectId", sql.NVarChar(100), args.patient.eligibilityObjectId || null)
    .input("patientMemberId", sql.NVarChar(100), args.patient.memberId || null)
    .input("patientName", sql.NVarChar(220), patientName || null)
    .input("groupId", sql.NVarChar(100), args.patient.groupId || null)
    .input("groupName", sql.NVarChar(200), args.patient.groupName || null)
    .input("programType", sql.NVarChar(40), args.program.programType)
    .input("programName", sql.NVarChar(200), args.program.programName)
    .input("planYearStart", sql.Date, args.benefit.planYearStart)
    .input("planYearEnd", sql.Date, args.benefit.planYearEnd)
    .input("thresholdPercent", sql.Decimal(5, 2), args.program.notificationThresholdPercent || 100)
    .input("annualMaxAmount", sql.Decimal(12, 2), args.benefit.annualMaxAmount)
    .input("utilizationAmount", sql.Decimal(12, 2), args.benefit.utilizationAfter)
    .input("remainingAmount", sql.Decimal(12, 2), args.benefit.remainingAfter)
    .input("recipientType", sql.NVarChar(40), args.recipientType)
    .input("recipientEmail", sql.NVarChar(255), args.recipientEmail)
    .input("recipientName", sql.NVarChar(200), args.recipientName)
    .input("status", sql.NVarChar(40), args.recipientEmail ? "queued" : "pending_missing_recipient")
    .input("emailQueueId", sql.BigInt, args.emailQueueId)
    .input("payload", sql.NVarChar(sql.MAX), JSON.stringify({ validationStatus: args.benefit.status, validationMessage: args.benefit.message }))
    .input("createdBy", sql.NVarChar(100), args.createdBy)
    .query(`
      INSERT INTO dbo.nbm_benefit_notifications (
        order_id, program_rule_id, eligibility_object_id, patient_member_id, patient_name,
        group_id, group_name, program_type, program_name, plan_year_start, plan_year_end,
        notification_type, threshold_percent, annual_max_amount, utilization_amount, remaining_amount,
        recipient_type, recipient_email, recipient_name, status, email_queue_id, payload_json, created_by
      )
      VALUES (
        @orderId, @programRuleId, @eligibilityObjectId, @patientMemberId, @patientName,
        @groupId, @groupName, @programType, @programName, @planYearStart, @planYearEnd,
        'annual_max_reached', @thresholdPercent, @annualMaxAmount, @utilizationAmount, @remainingAmount,
        @recipientType, @recipientEmail, @recipientName, @status, @emailQueueId, @payload, @createdBy
      )
    `)
}

async function queueBenefitNotifications(
  tx: sql.Transaction,
  args: {
    orderId: string
    orderNumber: string
    patient: ResolvedPatient
    program: NbmProgramRule
    benefit: BenefitEvaluation
    patientEmail: string | null
    locationEmail: string | null
    locationName: string | null
    createdBy: string
  }
) {
  if (!args.benefit.shouldNotifyMax) return

  const patientName = `${args.patient.firstName || ""} ${args.patient.lastName || ""}`.trim()
  const values = {
    patient_name: patientName,
    order_number: args.orderNumber,
    program_name: args.program.programName,
    utilization_amount: formatMoney(args.benefit.utilizationAfter),
  }

  if (args.program.patientNotificationEnabled) {
    const emailQueueId = await queueImmediateEmail(tx, {
      orderId: args.orderId,
      ruleKey: "annual_max_patient",
      recipientEmail: args.patientEmail,
      recipientName: patientName,
      values,
    })

    await insertBenefitNotification(tx, {
      orderId: args.orderId,
      patient: args.patient,
      program: args.program,
      benefit: args.benefit,
      recipientType: "patient",
      recipientEmail: args.patientEmail,
      recipientName: patientName,
      emailQueueId,
      createdBy: args.createdBy,
    })
  }

  if (args.program.locationNotificationEnabled) {
    const emailQueueId = await queueImmediateEmail(tx, {
      orderId: args.orderId,
      ruleKey: "annual_max_location",
      recipientEmail: args.locationEmail,
      recipientName: args.locationName,
      values,
    })

    await insertBenefitNotification(tx, {
      orderId: args.orderId,
      patient: args.patient,
      program: args.program,
      benefit: args.benefit,
      recipientType: "strata_location",
      recipientEmail: args.locationEmail,
      recipientName: args.locationName,
      emailQueueId,
      createdBy: args.createdBy,
    })
  }
}

async function findNbmEligibilityPatient(pool: sql.ConnectionPool, patientId: unknown): Promise<ResolvedPatient | null> {
  const liveKey = getNbmLiveEligibilityKey(patientId)
  if (liveKey) {
    const liveResult = await pool.request()
      .input("sourceKey", sql.NVarChar(200), liveKey)
      .query(`
        SELECT TOP 1
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
        WHERE keyset.sourceKey = @sourceKey
          AND (
            e.[Account Status] IS NULL
            OR LOWER(LTRIM(RTRIM(CONVERT(nvarchar(80), e.[Account Status])))) NOT IN ('inactive', 'terminated')
          )
          AND (
            e.recordstatus IS NULL
            OR LOWER(LTRIM(RTRIM(CONVERT(nvarchar(80), e.recordstatus)))) NOT IN ('inactive', 'terminated')
          )
          ${NBM_CONTRACT_BENEFIT_ELIGIBILITY_GROUP_SQL}
      `)

    const liveRow = liveResult.recordset[0]
    if (!liveRow) return null

    return {
      id: liveEligibilityId(liveRow.sourceKey),
      firstName: cleanValue(liveRow.firstName) || "",
      lastName: cleanValue(liveRow.lastName) || "",
      dob: liveRow.dob || null,
      memberId: cleanValue(liveRow.memberId),
      eligibilityObjectId: liveEligibilityObjectId(liveRow.sourceKey),
      employeeId: cleanValue(liveRow.employeeId),
      email: cleanValue(liveRow.email),
      phone: cleanValue(liveRow.phone),
      address1: cleanValue(liveRow.address1),
      address2: cleanValue(liveRow.address2),
      city: cleanValue(liveRow.city),
      state: cleanValue(liveRow.state),
      zip: cleanValue(liveRow.zip),
      groupId: cleanValue(liveRow.groupId),
      groupName: cleanValue(liveRow.groupName),
      supplementAllowance: liveRow.supplementAllowance == null ? null : Number(liveRow.supplementAllowance),
      supplementDiscount: liveRow.supplementDiscount == null ? null : Number(liveRow.supplementDiscount),
    }
  }

  return null
}

async function findLocalPatient(patientId: string): Promise<ResolvedPatient | null> {
  const patient = await db.patient.findUnique({ where: { id: patientId } })
  if (!patient) return null

  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dob: patient.dob || null,
    memberId: patient.memberId || null,
  }
}

function findLocalDevPatient(patientId: string): ResolvedPatient | null {
  const patient = devPatients.find((devPatient) => devPatient.id === patientId)
  if (!patient) return null

  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dob: patient.dob || null,
    memberId: patient.memberId || null,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: locationId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const items = Array.isArray(body.items) ? body.items as RxItemInput[] : []
  const orderCategory = String(body.orderCategory || body.sourceReference || "Initial RX").trim()
  const deliveryMethod = String(body.deliveryMethod || "Local").trim()

  if (!body.patientId || !body.providerId || items.length === 0) {
    return NextResponse.json({ error: "Patient, provider, and at least one product are required" }, { status: 400 })
  }

  if (!VALID_ORDER_CATEGORIES.has(orderCategory)) {
    return NextResponse.json({ error: "Invalid NBM category" }, { status: 400 })
  }

  if (!VALID_DELIVERY_METHODS.has(deliveryMethod)) {
    return NextResponse.json({ error: "Invalid delivery method" }, { status: 400 })
  }

  const validItems = items.filter((item) => item.productName?.trim())
  if (validItems.length === 0) {
    return NextResponse.json({ error: "At least one product name is required" }, { status: 400 })
  }

  const isAdmin = session.user.role === "ADMIN"
  if (!isAdmin) {
    const access = await db.userLocation.findUnique({
      where: { userId_locationId: { userId: session.user.id, locationId } },
    })
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let pool

  try {
    pool = await getNbmPool(await getNbmSqlPasswordFromCookies())
    await ensureNbmPricingSchema(pool)
  } catch (err) {
    if (err instanceof Error && err.message === "Missing SQL Server environment variables") {
      return NextResponse.json(
        { error: "NBM SQL password required", code: "NBM_SQL_PASSWORD_REQUIRED" },
        { status: 428 }
      )
    }

    throw err
  }

  const nbmEligibilityPatient = isNbmEligibilityPatientId(body.patientId)

  const [location, patient, provider] = await (async () => {
    try {
      return await Promise.all([
        db.location.findUnique({
          where: { id: locationId },
          include: { affiliate: true },
        }),
        nbmEligibilityPatient
          ? findNbmEligibilityPatient(pool, body.patientId)
          : findLocalPatient(body.patientId),
        db.provider.findUnique({ where: { id: body.providerId } }),
      ])
    } catch (err) {
      applyDevFallback("rx order submit lookups", err)
      return await Promise.all([
        Promise.resolve(findDevLocation(locationId)),
        nbmEligibilityPatient
          ? findNbmEligibilityPatient(pool, body.patientId)
          : Promise.resolve(findLocalDevPatient(body.patientId)),
        Promise.resolve(devProviders.find((provider) => provider.id === body.providerId) || null),
      ])
    }
  })()

  if (!location || !patient || !provider) {
    return NextResponse.json({ error: "Location, patient, or provider not found" }, { status: 404 })
  }

  const tx = new sql.Transaction(pool)
  await tx.begin()

  try {
    const orderNumber = formatOrderNumber()
    const patientName = `${patient.firstName} ${patient.lastName}`.trim()
    const submittedAt = new Date()
    const patientEmail = body.patientEmail || patient.email || null
    const patientPhone = body.patientPhone || patient.phone || null
    const shippingAddress1 = body.shippingAddress1 || patient.address1 || null
    const shippingAddress2 = body.shippingAddress2 || patient.address2 || null
    const shippingCity = body.shippingCity || patient.city || null
    const shippingState = body.shippingState || patient.state || null
    const shippingZip = body.shippingZip || patient.zip || null
    const program = await resolveProgramRule(pool, patient, locationId, body, submittedAt)
    const benefit = await evaluateBenefit(pool, patient, validItems, program, submittedAt)

    if (benefit.status.startsWith("rejected_")) {
      await tx.rollback()
      return NextResponse.json(
        { error: benefit.message, validationStatus: benefit.status },
        { status: 422 }
      )
    }

    const orderResult = await tx.request()
      .input("orderNumber", sql.NVarChar(32), orderNumber)
      .input("sourceReference", sql.NVarChar(100), orderCategory)
      .input("providerUserId", sql.NVarChar(100), session.user.id)
      .input("providerName", sql.NVarChar(200), provider.name)
      .input("providerEmail", sql.NVarChar(255), session.user.email)
      .input("providerNpi", sql.NVarChar(50), provider.npi || null)
      .input("locationId", sql.NVarChar(100), location.id)
      .input("locationName", sql.NVarChar(200), location.name)
      .input("affiliateId", sql.NVarChar(100), location.affiliateId)
      .input("affiliateName", sql.NVarChar(200), location.affiliate.name)
      .input("eligibilityObjectId", sql.NVarChar(100), patient.eligibilityObjectId || null)
      .input("patientEmployeeId", sql.NVarChar(100), patient.employeeId || null)
      .input("patientMemberId", sql.NVarChar(100), patient.memberId || null)
      .input("patientFirstName", sql.NVarChar(100), patient.firstName)
      .input("patientLastName", sql.NVarChar(100), patient.lastName)
      .input("patientDob", sql.Date, patient.dob || null)
      .input("patientEmail", sql.NVarChar(255), patientEmail)
      .input("patientPhone", sql.NVarChar(50), patientPhone)
      .input("groupId", sql.NVarChar(100), patient.groupId || null)
      .input("groupName", sql.NVarChar(200), patient.groupName || null)
      .input("shippingAddress1", sql.NVarChar(255), shippingAddress1)
      .input("shippingAddress2", sql.NVarChar(255), shippingAddress2)
      .input("shippingCity", sql.NVarChar(100), shippingCity)
      .input("shippingState", sql.NVarChar(50), shippingState)
      .input("shippingZip", sql.NVarChar(30), shippingZip)
      .input("deliveryMethod", sql.NVarChar(50), deliveryMethod)
      .input("providerNotes", sql.NVarChar(sql.MAX), body.notes || null)
      .input("programRuleId", sql.UniqueIdentifier, program.ruleId)
      .input("programType", sql.NVarChar(40), program.programType)
      .input("programName", sql.NVarChar(200), program.programName)
      .input("planYearStart", sql.Date, benefit.planYearStart)
      .input("planYearEnd", sql.Date, benefit.planYearEnd)
      .input("annualMaxAmount", sql.Decimal(12, 2), benefit.annualMaxAmount)
      .input("annualUtilizationBefore", sql.Decimal(12, 2), benefit.utilizationBefore)
      .input("annualUtilizationAfter", sql.Decimal(12, 2), benefit.utilizationAfter)
      .input("annualRemainingAfter", sql.Decimal(12, 2), benefit.remainingAfter)
      .input("benefitValidationStatus", sql.NVarChar(40), benefit.status)
      .input("benefitValidationMessage", sql.NVarChar(500), benefit.message)
      .input("programSnapshot", sql.NVarChar(sql.MAX), JSON.stringify(program))
      .query(`
        INSERT INTO dbo.nbm_rx_orders (
          order_number, source_reference, provider_user_id, provider_name, provider_email, provider_npi,
          location_id, location_name, affiliate_id, affiliate_name,
          eligibility_object_id, patient_employee_id, patient_member_id,
          patient_first_name, patient_last_name, patient_dob, patient_email, patient_phone,
          group_id, group_name,
          shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_zip,
          delivery_method, provider_notes, submitted_by,
          program_rule_id, program_type, program_name, plan_year_start, plan_year_end,
          annual_max_amount, annual_utilization_before, annual_utilization_after, annual_remaining_after,
          benefit_validation_status, benefit_validation_message, program_snapshot_json
        )
        OUTPUT inserted.id
        VALUES (
          @orderNumber, @sourceReference, @providerUserId, @providerName, @providerEmail, @providerNpi,
          @locationId, @locationName, @affiliateId, @affiliateName,
          @eligibilityObjectId, @patientEmployeeId, @patientMemberId,
          @patientFirstName, @patientLastName, @patientDob, @patientEmail, @patientPhone,
          @groupId, @groupName,
          @shippingAddress1, @shippingAddress2, @shippingCity, @shippingState, @shippingZip,
          @deliveryMethod, @providerNotes, @providerUserId,
          @programRuleId, @programType, @programName, @planYearStart, @planYearEnd,
          @annualMaxAmount, @annualUtilizationBefore, @annualUtilizationAfter, @annualRemainingAfter,
          @benefitValidationStatus, @benefitValidationMessage, @programSnapshot
        )
      `)

    const orderId = orderResult.recordset[0].id as string
    const createdItems: Array<{ id: string; productName: string; processRefillDate: Date | null; nextFillDate: Date | null; sixMonthDate: Date | null; nineMonthDate: Date | null }> = []

    for (const [index, item] of validItems.entries()) {
      const refillFrequencyDays = getRefillFrequencyDays(item.refillFrequencyDays)
      const processRefillDate = asDate(item.processRefillDate) || addDays(submittedAt, refillFrequencyDays)
      const nextFillDate = asDate(item.nextFillDate) || processRefillDate
      const sixMonthDate = addMonths(processRefillDate, 6)
      const nineMonthDate = addMonths(processRefillDate, 9)
      const normalizedItem: RxItemInput = {
        ...item,
        automaticRefill: program.refillsAllowed && item.automaticRefill !== false,
        copayAmount: productCopayAmount(item, program),
        retailCost: asNumber(item.retailCost) ?? undefined,
      }
      const pricing = itemPatientPricing(normalizedItem, benefit, program)
      normalizedItem.patientPayAmount = pricing.patientPayAmount
      normalizedItem.patientPayBasis = pricing.patientPayBasis

      const itemResult = await tx.request()
        .input("orderId", sql.UniqueIdentifier, orderId)
        .input("lineNumber", sql.Int, index + 1)
        .input("productId", sql.NVarChar(100), item.productId || null)
        .input("productSku", sql.NVarChar(100), item.productSku || null)
        .input("productName", sql.NVarChar(255), item.productName?.trim())
        .input("therapyType", sql.NVarChar(100), null)
        .input("dosage", sql.NVarChar(100), item.dosage || null)
        .input("numberOfBottles", sql.Int, 1)
        .input("refillFrequencyDays", sql.Int, refillFrequencyDays)
        .input("refillDurationMonths", sql.Int, asNumber(item.refillDurationMonths))
        .input("automaticRefill", sql.Bit, Boolean(normalizedItem.automaticRefill))
        .input("copayAmount", sql.Decimal(12, 2), asNumber(normalizedItem.copayAmount))
        .input("retailCost", sql.Decimal(12, 2), asNumber(normalizedItem.retailCost))
        .input("patientPayAmount", sql.Decimal(12, 2), pricing.patientPayAmount)
        .input("patientPayBasis", sql.NVarChar(40), pricing.patientPayBasis)
        .input("pricingMessage", sql.NVarChar(500), pricing.pricingMessage)
        .input("nextFillDate", sql.Date, nextFillDate)
        .input("processRefillDate", sql.Date, processRefillDate)
        .input("sixMonthDate", sql.Date, sixMonthDate)
        .input("nineMonthDate", sql.Date, nineMonthDate)
        .input("utilizationAmount", sql.Decimal(12, 2), itemUtilizationAmount(normalizedItem))
        .input("benefitAction", sql.NVarChar(40), benefit.status)
        .query(`
          INSERT INTO dbo.nbm_rx_order_items (
            order_id, line_number, product_object_id, product_sku, product_name, therapy_type, dosage,
            number_of_bottles, refill_frequency_days, refill_duration_months, automatic_refill,
            copay_amount, retail_cost, patient_pay_amount, patient_pay_basis, pricing_message,
            next_fill_date, process_refill_date,
            six_month_process_refill_date, nine_month_process_refill_date,
            utilization_amount, benefit_action
          )
          OUTPUT inserted.id
          VALUES (
            @orderId, @lineNumber, @productId, @productSku, @productName, @therapyType, @dosage,
            @numberOfBottles, @refillFrequencyDays, @refillDurationMonths, @automaticRefill,
            @copayAmount, @retailCost, @patientPayAmount, @patientPayBasis, @pricingMessage,
            @nextFillDate, @processRefillDate,
            @sixMonthDate, @nineMonthDate, @utilizationAmount, @benefitAction
          )
        `)

      const itemId = itemResult.recordset[0].id as string
      createdItems.push({
        id: itemId,
        productName: item.productName?.trim() || "",
        processRefillDate,
        nextFillDate,
        sixMonthDate,
        nineMonthDate,
      })

      await insertUtilizationEvent(tx, {
        orderId,
        itemId,
        item: normalizedItem,
        patient,
        program,
        benefit,
        createdBy: session.user.id,
      })
    }

    await tx.request()
      .input("orderId", sql.UniqueIdentifier, orderId)
      .input("changedBy", sql.NVarChar(100), session.user.id)
      .query(`
        INSERT INTO dbo.nbm_rx_status_history (order_id, to_status, reason, changed_by)
        VALUES (@orderId, 'submitted', 'provider_submission', @changedBy)
      `)

    await tx.request()
      .input("orderId", sql.UniqueIdentifier, orderId)
      .input("payload", sql.NVarChar(sql.MAX), JSON.stringify({ orderNumber, orderCategory, deliveryMethod, submittedAt }))
      .input("createdBy", sql.NVarChar(100), session.user.id)
      .query(`
        INSERT INTO dbo.nbm_workflow_events (order_id, event_type, event_source, payload_json, created_by)
        VALUES (@orderId, 'provider_order_submitted', 'istrata-claims', @payload, @createdBy)
      `)

    const rules = await tx.request().query(`
      SELECT rule_key, subject_template, body_template, trigger_date_field, offset_days
      FROM dbo.nbm_email_rules
      WHERE active = 1
        AND rule_key NOT IN ('annual_max_patient', 'annual_max_location', 'refill_payment_request')
    `)

    const recipientEmail = patientEmail || session.user.email
    for (const createdItem of createdItems) {
      for (const rule of rules.recordset) {
        const baseDate =
          rule.trigger_date_field === "six_month_process_refill_date" ? createdItem.sixMonthDate :
          rule.trigger_date_field === "nine_month_process_refill_date" ? createdItem.nineMonthDate :
          rule.trigger_date_field === "next_fill_date" ? createdItem.nextFillDate :
          createdItem.processRefillDate

        if (!baseDate || !recipientEmail) continue

        const scheduledFor = new Date(baseDate)
        scheduledFor.setDate(scheduledFor.getDate() + Number(rule.offset_days || 0))

        const values = {
          patient_name: patientName,
          product_name: createdItem.productName,
          order_number: orderNumber,
        }

        await tx.request()
          .input("orderId", sql.UniqueIdentifier, orderId)
          .input("itemId", sql.UniqueIdentifier, createdItem.id)
          .input("ruleKey", sql.NVarChar(80), rule.rule_key)
          .input("recipientEmail", sql.NVarChar(255), recipientEmail)
          .input("recipientName", sql.NVarChar(200), patientName || null)
          .input("subject", sql.NVarChar(255), renderTemplate(rule.subject_template, values))
          .input("body", sql.NVarChar(sql.MAX), renderTemplate(rule.body_template, values))
          .input("scheduledFor", sql.DateTime2, scheduledFor)
          .query(`
            INSERT INTO dbo.nbm_email_queue (
              order_id, item_id, rule_key, recipient_email, recipient_name, subject, body, scheduled_for
            )
            VALUES (
              @orderId, @itemId, @ruleKey, @recipientEmail, @recipientName, @subject, @body, @scheduledFor
            )
          `)
      }
    }

    await queueBenefitNotifications(tx, {
      orderId,
      orderNumber,
      patient,
      program,
      benefit,
      patientEmail,
      locationEmail: body.locationEmail || null,
      locationName: location.name || null,
      createdBy: session.user.id,
    })

    await tx.commit()
    return NextResponse.json({
      id: orderId,
      orderNumber,
      benefitValidationStatus: benefit.status,
      annualRemainingAfter: benefit.remainingAfter,
    }, { status: 201 })
  } catch (err) {
    await tx.rollback().catch(() => undefined)
    console.error("[rx-orders]", err)
    return NextResponse.json({ error: "Unable to submit RX order" }, { status: 500 })
  }
}
