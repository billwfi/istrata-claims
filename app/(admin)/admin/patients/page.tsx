"use client"

import { AdminCrudPage } from "@/components/admin/AdminCrudPage"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"

interface Patient {
  id: string
  firstName: string
  lastName: string
  dob?: string | null
  memberId?: string | null
  _count?: { claims: number }
}

function PatientFields({
  data,
  onChange,
}: {
  data: Partial<Patient>
  onChange: (u: Partial<Patient>) => void
  mode: "create" | "edit"
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>First Name</Label>
          <Input value={data.firstName || ""} onChange={(e) => onChange({ firstName: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Last Name</Label>
          <Input value={data.lastName || ""} onChange={(e) => onChange({ lastName: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Date of Birth</Label>
        <Input
          type="date"
          value={data.dob ? data.dob.split("T")[0] : ""}
          onChange={(e) => onChange({ dob: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Member ID</Label>
        <Input value={data.memberId || ""} onChange={(e) => onChange({ memberId: e.target.value })} placeholder="Optional" />
      </div>
    </div>
  )
}

export default function PatientsAdminPage() {
  return (
    <AdminCrudPage<Patient>
      title="Patients"
      apiPath="/api/admin/patients"
      columns={[
        { key: "lastName", label: "Last Name" },
        { key: "firstName", label: "First Name" },
        {
          key: "dob",
          label: "Date of Birth",
          render: (r) => r.dob ? format(new Date(r.dob), "MM/dd/yyyy") : "—",
        },
        { key: "memberId", label: "Member ID", render: (r) => r.memberId || "—" },
        { key: "claims", label: "Claims", render: (r) => r._count?.claims ?? 0 },
      ]}
      FormFields={PatientFields}
      defaultFormData={{ firstName: "", lastName: "" }}
    />
  )
}
