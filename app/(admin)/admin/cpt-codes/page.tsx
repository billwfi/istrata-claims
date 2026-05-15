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

interface CptCode {
  id: string
  code: string
  description: string
  serviceTypeId: string
  serviceType?: { name: string }
}

interface ServiceType {
  id: string
  name: string
}

function CptCodeFields({
  data,
  onChange,
}: {
  data: Partial<CptCode>
  onChange: (u: Partial<CptCode>) => void
  mode: "create" | "edit"
}) {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])

  useEffect(() => {
    fetch("/api/admin/service-types").then((r) => r.json()).then(setServiceTypes)
  }, [])

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Service Type</Label>
        <Select value={data.serviceTypeId || ""} onValueChange={(v) => onChange({ serviceTypeId: v ?? undefined })}>
          <SelectTrigger><SelectValue placeholder="Select service type..." /></SelectTrigger>
          <SelectContent>
            {serviceTypes.map((st) => (
              <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>CPT Code</Label>
        <Input
          value={data.code || ""}
          onChange={(e) => onChange({ code: e.target.value })}
          placeholder="e.g. 97110"
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input value={data.description || ""} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
    </div>
  )
}

export default function CptCodesAdminPage() {
  return (
    <AdminCrudPage<CptCode>
      title="CPT Codes"
      apiPath="/api/admin/cpt-codes"
      columns={[
        { key: "code", label: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
        { key: "description", label: "Description" },
        { key: "serviceType", label: "Service Type", render: (r) => r.serviceType?.name || "" },
      ]}
      FormFields={CptCodeFields}
      defaultFormData={{ code: "", description: "", serviceTypeId: "" }}
    />
  )
}
