"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, buttonVariants } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SearchCombobox } from "./SearchCombobox"
import { CptCodeSelector } from "./CptCodeSelector"
import { DiagnosisCodeSelector } from "./DiagnosisCodeSelector"
import { CalendarIcon, Save, Send } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface ServiceType {
  id: string
  name: string
}

interface NewClaimFormProps {
  locationId: string
  serviceTypes: ServiceType[]
}

interface PatientOption {
  id: string
  firstName: string
  lastName: string
}

interface ProviderOption {
  id: string
  name: string
  npi?: string | null
}

interface CptLine {
  cptCodeId: string
  units: number
}

interface DiagnosisLine {
  diagnosisCodeId: string
  sequence: number
}

export function NewClaimForm({ locationId, serviceTypes }: NewClaimFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Form fields
  const [patientId, setPatientId] = useState("")
  const [providerId, setProviderId] = useState("")
  const [serviceTypeId, setServiceTypeId] = useState("")
  const [dateOfService, setDateOfService] = useState<Date>()
  const [notes, setNotes] = useState("")
  const [cptLines, setCptLines] = useState<CptLine[]>([{ cptCodeId: "", units: 1 }])
  const [diagnosisLines, setDiagnosisLines] = useState<DiagnosisLine[]>([
    { diagnosisCodeId: "", sequence: 1 },
  ])

  // Search state
  const [patients, setPatients] = useState<PatientOption[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [patientLoading, setPatientLoading] = useState(false)
  const [providerLoading, setProviderLoading] = useState(false)

  function handlePatientSearch(q: string) {
    setPatientLoading(true)
    fetch(`/api/patients?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setPatients(data)
        setPatientLoading(false)
      })
  }

  function handleProviderSearch(q: string) {
    setProviderLoading(true)
    fetch(`/api/locations/${locationId}/providers?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setProviders(data)
        setProviderLoading(false)
      })
  }

  // Load initial patient/provider lists
  useEffect(() => {
    handlePatientSearch("")
    handleProviderSearch("")
  }, [])

  async function submit(status: "DRAFT" | "SUBMITTED") {
    if (status === "SUBMITTED") {
      if (!patientId || !providerId || !serviceTypeId || !dateOfService) {
        toast.error("Please fill in all required fields")
        return
      }
      const validCpts = cptLines.filter((l) => l.cptCodeId)
      if (validCpts.length === 0) {
        toast.error("Please add at least one CPT code")
        return
      }
      const validDiags = diagnosisLines.filter((l) => l.diagnosisCodeId)
      if (validDiags.length === 0) {
        toast.error("Please add at least one diagnosis code")
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/locations/${locationId}/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          providerId,
          serviceTypeId,
          dateOfService: dateOfService?.toISOString(),
          notes,
          status,
          cptLines: cptLines.filter((l) => l.cptCodeId),
          diagnosisLines: diagnosisLines.filter((l) => l.diagnosisCodeId),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to save claim")
      }

      toast.success(
        status === "SUBMITTED" ? "Claim submitted successfully" : "Claim saved as draft"
      )
      router.push(`/locations/${locationId}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-8">
        {/* Patient & Provider */}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>
              Patient <span className="text-red-500">*</span>
            </Label>
            <SearchCombobox
              options={patients.map((p) => ({
                value: p.id,
                label: `${p.lastName}, ${p.firstName}`,
              }))}
              value={patientId}
              onValueChange={(v) => setPatientId(v ?? "")}
              placeholder="Search patients..."
              searchPlaceholder="Type to search patients..."
              onSearch={handlePatientSearch}
              loading={patientLoading}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Provider <span className="text-red-500">*</span>
            </Label>
            <SearchCombobox
              options={providers.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: p.npi ? `NPI: ${p.npi}` : undefined,
              }))}
              value={providerId}
              onValueChange={(v) => setProviderId(v ?? "")}
              placeholder="Search providers..."
              searchPlaceholder="Type to search providers..."
              onSearch={handleProviderSearch}
              loading={providerLoading}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Service Type <span className="text-red-500">*</span>
            </Label>
            <Select
              value={serviceTypeId}
              onValueChange={(v) => {
                setServiceTypeId(v ?? "")
                setCptLines([{ cptCodeId: "", units: 1 }])
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select service type..." />
              </SelectTrigger>
              <SelectContent>
                {serviceTypes.map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Date of Service <span className="text-red-500">*</span>
            </Label>
            <Popover>
              <PopoverTrigger
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-full justify-start text-left font-normal",
                  !dateOfService && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateOfService ? format(dateOfService, "MM/dd/yyyy") : "Pick a date"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateOfService}
                  onSelect={(d) => setDateOfService(d ?? undefined)}
                  disabled={(d) => d > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Separator />

        {/* CPT Codes */}
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">CPT Codes</h3>
          <CptCodeSelector
            serviceTypeId={serviceTypeId}
            value={cptLines}
            onChange={setCptLines}
          />
        </div>

        <Separator />

        {/* Diagnosis Codes */}
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Diagnosis Codes</h3>
          <DiagnosisCodeSelector value={diagnosisLines} onChange={setDiagnosisLines} />
        </div>

        <Separator />

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            placeholder="Any additional information..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/locations/${locationId}`)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => submit("DRAFT")}
            disabled={saving}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Save as Draft
          </Button>
          <Button
            type="button"
            onClick={() => submit("SUBMITTED")}
            disabled={saving}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            Submit Claim
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
