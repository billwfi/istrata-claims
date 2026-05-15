"use client"

import { AdminCrudPage } from "@/components/admin/AdminCrudPage"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Affiliate {
  id: string
  name: string
  _count?: { locations: number; users: number }
}

function AffiliateFields({
  data,
  onChange,
}: {
  data: Partial<Affiliate>
  onChange: (u: Partial<Affiliate>) => void
  mode: "create" | "edit"
}) {
  return (
    <div className="space-y-2">
      <Label>Name</Label>
      <Input
        value={data.name || ""}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Affiliate organization name"
      />
    </div>
  )
}

export default function AffiliatesPage() {
  return (
    <AdminCrudPage<Affiliate>
      title="Affiliates"
      apiPath="/api/admin/affiliates"
      columns={[
        { key: "name", label: "Name" },
        {
          key: "locations",
          label: "Locations",
          render: (row) => row._count?.locations ?? 0,
        },
        {
          key: "users",
          label: "Users",
          render: (row) => row._count?.users ?? 0,
        },
      ]}
      FormFields={AffiliateFields}
      defaultFormData={{ name: "" }}
    />
  )
}
