"use client"

import { useState, useEffect } from "react"
import { AdminCrudPage } from "@/components/admin/AdminCrudPage"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Location {
  id: string
  name: string
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  affiliateId: string
  affiliate?: { name: string }
  _count?: { claims: number }
}

interface Affiliate {
  id: string
  name: string
}

function LocationFields({
  data,
  onChange,
}: {
  data: Partial<Location>
  onChange: (u: Partial<Location>) => void
  mode: "create" | "edit"
}) {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([])

  useEffect(() => {
    fetch("/api/admin/affiliates").then((r) => r.json()).then(setAffiliates)
  }, [])

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Affiliate</Label>
        <Select value={data.affiliateId || ""} onValueChange={(v) => onChange({ affiliateId: v ?? undefined })}>
          <SelectTrigger><SelectValue placeholder="Select affiliate..." /></SelectTrigger>
          <SelectContent>
            {affiliates.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Location Name</Label>
        <Input value={data.name || ""} onChange={(e) => onChange({ name: e.target.value })} placeholder="Location name" />
      </div>
      <div className="space-y-1">
        <Label>Address</Label>
        <Input value={data.address || ""} onChange={(e) => onChange({ address: e.target.value })} placeholder="Street address" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1 col-span-1">
          <Label>City</Label>
          <Input value={data.city || ""} onChange={(e) => onChange({ city: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>State</Label>
          <Input value={data.state || ""} onChange={(e) => onChange({ state: e.target.value })} maxLength={2} placeholder="TX" />
        </div>
        <div className="space-y-1">
          <Label>ZIP</Label>
          <Input value={data.zip || ""} onChange={(e) => onChange({ zip: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

export default function LocationsAdminPage() {
  return (
    <AdminCrudPage<Location>
      title="Locations"
      apiPath="/api/admin/locations"
      columns={[
        { key: "name", label: "Name" },
        { key: "affiliate", label: "Affiliate", render: (r) => r.affiliate?.name || "" },
        { key: "city", label: "City", render: (r) => [r.city, r.state].filter(Boolean).join(", ") },
        { key: "claims", label: "Claims", render: (r) => r._count?.claims ?? 0 },
      ]}
      FormFields={LocationFields}
      defaultFormData={{ name: "", affiliateId: "" }}
    />
  )
}
