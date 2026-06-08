export function devFallbackAllowed() {
  return process.env.ALLOW_TEST_LOGIN === "1" || process.env.NODE_ENV === "development"
}

const loggedFallbackScopes = new Set<string>()

export function applyDevFallback(scope: string, err: unknown) {
  if (!devFallbackAllowed()) throw err
  if (loggedFallbackScopes.has(scope)) return
  loggedFallbackScopes.add(scope)
  console.warn(`[dev-fallback] ${scope}`, err instanceof Error ? err.message : err)
}

export const devAffiliate = {
  id: "seed-affiliate-1",
  name: "Sample Affiliate Group",
}

export const devLocations = [
  {
    id: "seed-location-1",
    name: "Main Street Clinic",
    address: "123 Main Street",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    affiliateId: devAffiliate.id,
    affiliate: devAffiliate,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "seed-location-2",
    name: "North Dallas Wellness",
    address: "456 Wellness Way",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    affiliateId: devAffiliate.id,
    affiliate: devAffiliate,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
]

export const devPatients = [
  {
    id: "seed-patient-1",
    firstName: "John",
    lastName: "Doe",
    dob: new Date("1980-01-15T00:00:00Z"),
    memberId: "MBR-001",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
]

export const devProviders = [
  {
    id: "seed-provider-1",
    name: "Dr. Jane Smith",
    npi: "1234567890",
    specialty: "Physical Therapy",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
]

export function findDevLocation(id: string) {
  return devLocations.find((location) => location.id === id) || null
}
