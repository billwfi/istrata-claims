"use client"

import { AdminCrudPage } from "@/components/admin/AdminCrudPage"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DiagnosisCode {
  id: string
  code: string
  description: string
}

function DiagnosisCodeFields({
  data,
  onChange,
}: {
  data: Partial<DiagnosisCode>
  onChange: (u: Partial<DiagnosisCode>) => void
  mode: "create" | "edit"
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>ICD-10 Code</Label>
        <Input
          value={data.code || ""}
          onChange={(e) => onChange({ code: e.target.value })}
          placeholder="e.g. M54.5"
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input
          value={data.description || ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="e.g. Low back pain"
        />
      </div>
    </div>
  )
}

export default function DiagnosisCodesAdminPage() {
  return (
    <AdminCrudPage<DiagnosisCode>
      title="Diagnosis Codes"
      apiPath="/api/admin/diagnosis-codes"
      columns={[
        { key: "code", label: "ICD-10 Code", render: (r) => <span className="font-mono">{r.code}</span> },
        { key: "description", label: "Description" },
      ]}
      FormFields={DiagnosisCodeFields}
      defaultFormData={{ code: "", description: "" }}
    />
  )
}
