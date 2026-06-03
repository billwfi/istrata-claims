import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getNbmPool, sql } from "@/lib/nbm-sql"
import { NextRequest, NextResponse } from "next/server"

interface RxItemInput {
  productId?: string
  productName?: string
  productSku?: string
  therapyType?: string
  dosage?: string
  numberOfBottles?: number
  refillFrequencyDays?: number
  refillDurationMonths?: number
  automaticRefill?: boolean
  copayAmount?: number
  retailCost?: number
  nextFillDate?: string
  processRefillDate?: string
}

function asDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function asNumber(value: unknown) {
  if (value === "" || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: locationId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const items = Array.isArray(body.items) ? body.items as RxItemInput[] : []

  if (!body.patientId || !body.providerId || items.length === 0) {
    return NextResponse.json({ error: "Patient, provider, and at least one product are required" }, { status: 400 })
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

  const [location, patient, provider] = await Promise.all([
    db.location.findUnique({
      where: { id: locationId },
      include: { affiliate: true },
    }),
    db.patient.findUnique({ where: { id: body.patientId } }),
    db.provider.findUnique({ where: { id: body.providerId } }),
  ])

  if (!location || !patient || !provider) {
    return NextResponse.json({ error: "Location, patient, or provider not found" }, { status: 404 })
  }

  const pool = await getNbmPool()
  const tx = new sql.Transaction(pool)
  await tx.begin()

  try {
    const orderNumber = formatOrderNumber()
    const patientName = `${patient.firstName} ${patient.lastName}`.trim()
    const submittedAt = new Date()

    const orderResult = await tx.request()
      .input("orderNumber", sql.NVarChar(32), orderNumber)
      .input("sourceReference", sql.NVarChar(100), null)
      .input("providerUserId", sql.NVarChar(100), session.user.id)
      .input("providerName", sql.NVarChar(200), provider.name)
      .input("providerEmail", sql.NVarChar(255), session.user.email)
      .input("providerNpi", sql.NVarChar(50), provider.npi || null)
      .input("locationId", sql.NVarChar(100), location.id)
      .input("locationName", sql.NVarChar(200), location.name)
      .input("affiliateId", sql.NVarChar(100), location.affiliateId)
      .input("affiliateName", sql.NVarChar(200), location.affiliate.name)
      .input("patientMemberId", sql.NVarChar(100), patient.memberId || null)
      .input("patientFirstName", sql.NVarChar(100), patient.firstName)
      .input("patientLastName", sql.NVarChar(100), patient.lastName)
      .input("patientDob", sql.Date, patient.dob || null)
      .input("patientEmail", sql.NVarChar(255), body.patientEmail || null)
      .input("patientPhone", sql.NVarChar(50), body.patientPhone || null)
      .input("shippingAddress1", sql.NVarChar(255), body.shippingAddress1 || null)
      .input("shippingAddress2", sql.NVarChar(255), body.shippingAddress2 || null)
      .input("shippingCity", sql.NVarChar(100), body.shippingCity || null)
      .input("shippingState", sql.NVarChar(50), body.shippingState || null)
      .input("shippingZip", sql.NVarChar(30), body.shippingZip || null)
      .input("deliveryMethod", sql.NVarChar(50), body.deliveryMethod || null)
      .input("providerNotes", sql.NVarChar(sql.MAX), body.notes || null)
      .query(`
        INSERT INTO dbo.nbm_rx_orders (
          order_number, source_reference, provider_user_id, provider_name, provider_email, provider_npi,
          location_id, location_name, affiliate_id, affiliate_name, patient_member_id,
          patient_first_name, patient_last_name, patient_dob, patient_email, patient_phone,
          shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_zip,
          delivery_method, provider_notes, submitted_by
        )
        OUTPUT inserted.id
        VALUES (
          @orderNumber, @sourceReference, @providerUserId, @providerName, @providerEmail, @providerNpi,
          @locationId, @locationName, @affiliateId, @affiliateName, @patientMemberId,
          @patientFirstName, @patientLastName, @patientDob, @patientEmail, @patientPhone,
          @shippingAddress1, @shippingAddress2, @shippingCity, @shippingState, @shippingZip,
          @deliveryMethod, @providerNotes, @providerUserId
        )
      `)

    const orderId = orderResult.recordset[0].id as string
    const createdItems: Array<{ id: string; productName: string; processRefillDate: Date | null; nextFillDate: Date | null; sixMonthDate: Date | null; nineMonthDate: Date | null }> = []

    for (const [index, item] of validItems.entries()) {
      const processRefillDate = asDate(item.processRefillDate)
      const nextFillDate = asDate(item.nextFillDate)
      const sixMonthDate = processRefillDate ? new Date(processRefillDate) : null
      if (sixMonthDate) sixMonthDate.setMonth(sixMonthDate.getMonth() + 6)
      const nineMonthDate = processRefillDate ? new Date(processRefillDate) : null
      if (nineMonthDate) nineMonthDate.setMonth(nineMonthDate.getMonth() + 9)

      const itemResult = await tx.request()
        .input("orderId", sql.UniqueIdentifier, orderId)
        .input("lineNumber", sql.Int, index + 1)
        .input("productId", sql.NVarChar(100), item.productId || null)
        .input("productSku", sql.NVarChar(100), item.productSku || null)
        .input("productName", sql.NVarChar(255), item.productName?.trim())
        .input("therapyType", sql.NVarChar(100), item.therapyType || null)
        .input("dosage", sql.NVarChar(100), item.dosage || null)
        .input("numberOfBottles", sql.Int, asNumber(item.numberOfBottles))
        .input("refillFrequencyDays", sql.Int, asNumber(item.refillFrequencyDays))
        .input("refillDurationMonths", sql.Int, asNumber(item.refillDurationMonths))
        .input("automaticRefill", sql.Bit, Boolean(item.automaticRefill))
        .input("copayAmount", sql.Decimal(12, 2), asNumber(item.copayAmount))
        .input("retailCost", sql.Decimal(12, 2), asNumber(item.retailCost))
        .input("nextFillDate", sql.Date, nextFillDate)
        .input("processRefillDate", sql.Date, processRefillDate)
        .input("sixMonthDate", sql.Date, sixMonthDate)
        .input("nineMonthDate", sql.Date, nineMonthDate)
        .query(`
          INSERT INTO dbo.nbm_rx_order_items (
            order_id, line_number, product_object_id, product_sku, product_name, therapy_type, dosage,
            number_of_bottles, refill_frequency_days, refill_duration_months, automatic_refill,
            copay_amount, retail_cost, next_fill_date, process_refill_date,
            six_month_process_refill_date, nine_month_process_refill_date
          )
          OUTPUT inserted.id
          VALUES (
            @orderId, @lineNumber, @productId, @productSku, @productName, @therapyType, @dosage,
            @numberOfBottles, @refillFrequencyDays, @refillDurationMonths, @automaticRefill,
            @copayAmount, @retailCost, @nextFillDate, @processRefillDate,
            @sixMonthDate, @nineMonthDate
          )
        `)

      createdItems.push({
        id: itemResult.recordset[0].id as string,
        productName: item.productName?.trim() || "",
        processRefillDate,
        nextFillDate,
        sixMonthDate,
        nineMonthDate,
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
      .input("payload", sql.NVarChar(sql.MAX), JSON.stringify({ orderNumber, submittedAt }))
      .input("createdBy", sql.NVarChar(100), session.user.id)
      .query(`
        INSERT INTO dbo.nbm_workflow_events (order_id, event_type, event_source, payload_json, created_by)
        VALUES (@orderId, 'provider_order_submitted', 'istrata-claims', @payload, @createdBy)
      `)

    const rules = await tx.request().query(`
      SELECT rule_key, subject_template, body_template, trigger_date_field, offset_days
      FROM dbo.nbm_email_rules
      WHERE active = 1
    `)

    const recipientEmail = body.patientEmail || session.user.email
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

    await tx.commit()
    return NextResponse.json({ id: orderId, orderNumber }, { status: 201 })
  } catch (err) {
    await tx.rollback().catch(() => undefined)
    console.error("[rx-orders]", err)
    return NextResponse.json({ error: "Unable to submit RX order" }, { status: 500 })
  }
}
