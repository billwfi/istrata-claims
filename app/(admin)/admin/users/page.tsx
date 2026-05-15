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
  affiliate?: { name: string }
}

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  affiliateId?: string | null
  affiliate?: { name: string } | null
  userLocations?: Array<{ location: { id: string; name: string } }>
  locationIds?: string[]
  password?: string
}

function UserFields({
  data,
  onChange,
  mode,
}: {
  data: Partial<UserRow>
  onChange: (u: Partial<UserRow>) => void
  mode: "create" | "edit"
}) {
  const [locations, setLocations] = useState<Location[]>([])
  const [affiliates, setAffiliates] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch("/api/admin/locations").then((r) => r.json()).then(setLocations)
    fetch("/api/admin/affiliates").then((r) => r.json()).then(setAffiliates)
  }, [])

  const selectedLocationIds: string[] = data.locationIds ||
    data.userLocations?.map((ul) => ul.location.id) || []

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
        <Label>Email</Label>
        <Input type="email" value={data.email || ""} onChange={(e) => onChange({ email: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>{mode === "create" ? "Password" : "New Password (leave blank to keep)"}</Label>
        <Input type="password" value={data.password || ""} onChange={(e) => onChange({ password: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Role</Label>
        <Select value={data.role || "PROVIDER"} onValueChange={(v) => onChange({ role: v ?? undefined })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PROVIDER">Provider</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
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

export default function UsersAdminPage() {
  return (
    <AdminCrudPage<UserRow>
      title="Users"
      apiPath="/api/admin/users"
      columns={[
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "role", label: "Role" },
        { key: "affiliate", label: "Affiliate", render: (r) => r.affiliate?.name || "" },
        {
          key: "locations",
          label: "Locations",
          render: (r) => r.userLocations?.length ?? 0,
        },
      ]}
      FormFields={UserFields}
      defaultFormData={{ name: "", email: "", password: "", role: "PROVIDER" }}
    />
  )
}
