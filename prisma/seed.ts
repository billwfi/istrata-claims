import "dotenv/config"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../lib/generated/prisma/client"
import bcrypt from "bcryptjs"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding database...")

  // Admin user
  const adminPassword = await bcrypt.hash("admin123!", 10)
  const admin = await db.user.upsert({
    where: { email: "admin@istrata.com" },
    update: {},
    create: {
      email: "admin@istrata.com",
      password: adminPassword,
      name: "iStrata Admin",
      role: "ADMIN",
    },
  })
  console.log("Admin user:", admin.email)

  // Sample affiliate
  const affiliate = await db.affiliate.upsert({
    where: { id: "seed-affiliate-1" },
    update: {},
    create: {
      id: "seed-affiliate-1",
      name: "Sample Affiliate Group",
    },
  })

  // Sample location
  const location = await db.location.upsert({
    where: { id: "seed-location-1" },
    update: {},
    create: {
      id: "seed-location-1",
      name: "Main Street Clinic",
      address: "123 Main Street",
      city: "Dallas",
      state: "TX",
      zip: "75001",
      affiliateId: affiliate.id,
    },
  })

  // Sample service types
  const physicalTherapy = await db.serviceType.upsert({
    where: { id: "seed-st-pt" },
    update: {},
    create: {
      id: "seed-st-pt",
      name: "Physical Therapy",
      description: "Physical therapy and rehabilitation services",
    },
  })

  const occupationalTherapy = await db.serviceType.upsert({
    where: { id: "seed-st-ot" },
    update: {},
    create: {
      id: "seed-st-ot",
      name: "Occupational Therapy",
      description: "Occupational therapy services",
    },
  })

  // Sample CPT codes
  const ptCpts = [
    { code: "97110", description: "Therapeutic exercises" },
    { code: "97112", description: "Neuromuscular reeducation" },
    { code: "97140", description: "Manual therapy techniques" },
    { code: "97150", description: "Therapeutic procedure - group" },
    { code: "97530", description: "Therapeutic activities" },
  ]

  for (const cpt of ptCpts) {
    await db.cptCode.upsert({
      where: { code: cpt.code },
      update: {},
      create: { ...cpt, serviceTypeId: physicalTherapy.id },
    })
  }

  const otCpts = [
    { code: "97165", description: "OT evaluation, low complexity" },
    { code: "97166", description: "OT evaluation, moderate complexity" },
    { code: "97167", description: "OT evaluation, high complexity" },
    { code: "97168", description: "OT re-evaluation" },
    { code: "97535", description: "Self-care/home management training" },
  ]

  for (const cpt of otCpts) {
    await db.cptCode.upsert({
      where: { code: cpt.code },
      update: {},
      create: { ...cpt, serviceTypeId: occupationalTherapy.id },
    })
  }

  // Sample ICD-10 diagnosis codes
  const diagnosisCodes = [
    { code: "M54.5", description: "Low back pain" },
    { code: "M54.2", description: "Cervicalgia (neck pain)" },
    { code: "M25.511", description: "Pain in right shoulder" },
    { code: "M25.512", description: "Pain in left shoulder" },
    { code: "M25.361", description: "Stiffness of right knee" },
    { code: "M25.362", description: "Stiffness of left knee" },
    { code: "S39.012A", description: "Strain of muscle of lower back" },
    { code: "G89.29", description: "Other chronic pain" },
    { code: "M79.3", description: "Panniculitis" },
    { code: "Z87.39", description: "Personal history of musculoskeletal disorders" },
  ]

  for (const dc of diagnosisCodes) {
    await db.diagnosisCode.upsert({
      where: { code: dc.code },
      update: {},
      create: dc,
    })
  }

  // Sample provider
  const provider = await db.provider.upsert({
    where: { id: "seed-provider-1" },
    update: {},
    create: {
      id: "seed-provider-1",
      name: "Dr. Jane Smith",
      npi: "1234567890",
      specialty: "Physical Therapy",
    },
  })

  // Link provider to location
  await db.locationProvider.upsert({
    where: { locationId_providerId: { locationId: location.id, providerId: provider.id } },
    update: {},
    create: { locationId: location.id, providerId: provider.id },
  })

  // Sample patient
  const patient = await db.patient.upsert({
    where: { id: "seed-patient-1" },
    update: {},
    create: {
      id: "seed-patient-1",
      firstName: "John",
      lastName: "Doe",
      dob: new Date("1980-01-15"),
      memberId: "MBR-001",
    },
  })

  // Sample provider user
  const providerPassword = await bcrypt.hash("provider123!", 10)
  const providerUser = await db.user.upsert({
    where: { email: "provider@example.com" },
    update: {},
    create: {
      email: "provider@example.com",
      password: providerPassword,
      name: "Test Provider",
      role: "PROVIDER",
      affiliateId: affiliate.id,
    },
  })

  // Assign provider user to location
  await db.userLocation.upsert({
    where: { userId_locationId: { userId: providerUser.id, locationId: location.id } },
    update: {},
    create: { userId: providerUser.id, locationId: location.id },
  })

  console.log("Seed complete!")
  console.log("Admin login: admin@istrata.com / admin123!")
  console.log("Provider login: provider@example.com / provider123!")
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
