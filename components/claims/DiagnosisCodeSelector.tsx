"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SearchCombobox } from "./SearchCombobox"
import { Plus, Trash2 } from "lucide-react"

interface DiagnosisLine {
  diagnosisCodeId: string
  sequence: number
}

interface DiagnosisCode {
  id: string
  code: string
  description: string
}

interface DiagnosisCodeSelectorProps {
  value: DiagnosisLine[]
  onChange: (lines: DiagnosisLine[]) => void
}

export function DiagnosisCodeSelector({ value, onChange }: DiagnosisCodeSelectorProps) {
  const [codes, setCodes] = useState<DiagnosisCode[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const fetchCodes = async () => {
      setLoading(true)
      const res = await fetch(`/api/diagnosis-codes?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setCodes(data)
      setLoading(false)
    }
    fetchCodes()
  }, [query])

  function addLine() {
    onChange([...value, { diagnosisCodeId: "", sequence: value.length + 1 }])
  }

  function removeLine(index: number) {
    const updated = value
      .filter((_, i) => i !== index)
      .map((line, i) => ({ ...line, sequence: i + 1 }))
    onChange(updated)
  }

  function updateCode(index: number, diagnosisCodeId: string) {
    onChange(value.map((line, i) => (i === index ? { ...line, diagnosisCodeId } : line)))
  }

  return (
    <div className="space-y-3">
      {value.map((line, index) => {
        const lineOptions = codes
          .filter(
            (c) =>
              c.id === line.diagnosisCodeId ||
              !value.some((v, i) => i !== index && v.diagnosisCodeId === c.id)
          )
          .map((c) => ({
            value: c.id,
            label: `${c.code} — ${c.description}`,
            sublabel: c.code,
          }))

        return (
          <div key={index} className="flex items-end gap-3">
            <div className="w-24 shrink-0">
              {index === 0 && <Label className="mb-1 block">Sequence</Label>}
              <div className="flex items-center h-10 px-3 border rounded-md bg-gray-50 text-sm text-gray-700">
                {index === 0 ? "Primary" : `${index + 1}`}
              </div>
            </div>
            <div className="flex-1">
              {index === 0 && <Label className="mb-1 block">Diagnosis Code (ICD-10)</Label>}
              <SearchCombobox
                options={lineOptions}
                value={line.diagnosisCodeId}
                onValueChange={(v) => updateCode(index, v)}
                placeholder="Search ICD-10 codes..."
                searchPlaceholder="Search by code or description..."
                onSearch={setQuery}
                loading={loading}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => removeLine(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={addLine}
      >
        <Plus className="h-4 w-4" />
        Add Diagnosis Code
      </Button>
    </div>
  )
}
