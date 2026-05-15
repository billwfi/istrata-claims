"use client"

import { AdminCrudPage } from "@/components/admin/AdminCrudPage"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ServiceType {
  id: string
  name: string
  description?: string | null
  _count?: { cptCodes: number; claims: number }
}

function ServiceTypeFields({
  data,
  onChange,
}: {
  data: Partial<ServiceType>
  onChange: (u: Partial<ServiceType>) => void
  mode: "create" | "edit"
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={data.name || ""} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Physical Therapy" />
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input value={data.description || ""} onChange={(e) => onChange({ description: e.target.value })} placeholder="Optional" />
      </div>
    </div>
  )
}

export default function ServiceTypesAdminPage() {
  return (
    <AdminCrudPage<ServiceType>
      title="Service Types"
      apiPath="/api/admin/service-types"
      columns={[
        { key: "name", label: "Name" },
        { key: "description", label: "Description", render: (r) => r.description || "—" },
        { key: "cptCodes", label: "CPT Codes", render: (r) => r._count?.cptCodes ?? 0 },
        { key: "claims", label: "Claims", render: (r) => r._count?.claims ?? 0 },
      ]}
      FormFields={ServiceTypeFields}
      defaultFormData={{ name: "" }}
    />
  )
}
