"use client"

import { useState, useEffect } from "react"
import { AdminCrudPage } from "@/components/admin/AdminCrudPage"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Provider {
  id: string
  name: string
  npi?: string | null
  specialty?: string | null
  locationProviders?: Array<{ location: { id: string; name: string } }>
  locationIds?: string[]
  _count?: { claims: number }
}

interface Location {
  id: string
  name: string
  affiliate?: { name: string }
}

function ProviderFields({
  data,
  onChange,
}: {
  data: Partial<Provider>
  onChange: (u: Partial<Provider>) => void
  mode: "create" | "edit"
}) {
  const [locations, setLocations] = useState<Location[]>([])

  useEffect(() => {
    fetch("/api/admin/locations").then((r) => r.json()).then(setLocations)
  }, [])

  const selectedLocationIds: string[] = data.locationIds ||
    data.locationProviders?.map((lp) => lp.location.id) || []

  function toggleLocation(locationId: string) {
    const next = selectedLocationIds.includes(locationId)
      ? selectedLocationIds.filter((id) => id !== locationId)
      : [...selectedLocationIds, locationId]
    onChange({ locationIds: next })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={data.name || ""} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>NPI Number</Label>
        <Input value={data.npi || ""} onChange={(e) => onChange({ npi: e.target.value })} placeholder="Optional" />
      </div>
      <div className="space-y-1">
        <Label>Specialty</Label>
        <Input value={data.specialty || ""} onChange={(e) => onChange({ specialty: e.target.value })} placeholder="Optional" />
      </div>
      <div className="space-y-1">
        <Label>Assigned Locations</Label>
        <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
          {locations.map((loc) => (
            <label key={loc.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
              <input
                type="checkbox"
                checked={selectedLocationIds.includes(loc.id)}
                onChange={() => toggleLocation(loc.id)}
              />
              {loc.name} {loc.affiliate ? `(${loc.affiliate.name})` : ""}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ProvidersAdminPage() {
  return (
    <AdminCrudPage<Provider>
      title="Providers"
      apiPath="/api/admin/providers"
      columns={[
        { key: "name", label: "Name" },
        { key: "npi", label: "NPI", render: (r) => r.npi || "—" },
        { key: "specialty", label: "Specialty", render: (r) => r.specialty || "—" },
        { key: "locations", label: "Locations", render: (r) => r.locationProviders?.length ?? 0 },
        { key: "claims", label: "Claims", render: (r) => r._count?.claims ?? 0 },
      ]}
      FormFields={ProviderFields}
      defaultFormData={{ name: "" }}
    />
  )
}
