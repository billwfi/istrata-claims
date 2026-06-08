"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SearchCombobox } from "./SearchCombobox"
import { Plus, Trash2 } from "lucide-react"

interface CptLine {
  cptCodeId: string
  units: number
}

interface CptCode {
  id: string
  code: string
  description: string
}

interface CptCodeSelectorProps {
  serviceTypeId: string
  value: CptLine[]
  onChange: (lines: CptLine[]) => void
}

export function CptCodeSelector({ serviceTypeId, value, onChange }: CptCodeSelectorProps) {
  const [cptCodes, setCptCodes] = useState<CptCode[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!serviceTypeId) {
      setCptCodes([])
      return
    }
    const fetchCodes = async () => {
      setLoading(true)
      const res = await fetch(
        `/api/cpt-codes?serviceTypeId=${serviceTypeId}&q=${encodeURIComponent(query)}`
      )
      const data = await res.json()
      setCptCodes(data)
      setLoading(false)
    }
    fetchCodes()
  }, [serviceTypeId, query])

  const options = cptCodes
    .filter((c) => !value.some((v) => v.cptCodeId === c.id))
    .map((c) => ({
      value: c.id,
      label: `${c.code} — ${c.description}`,
      sublabel: c.code,
    }))

  void options

  function addLine() {
    onChange([...value, { cptCodeId: "", units: 1 }])
  }

  function removeLine(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function updateLine(index: number, updates: Partial<CptLine>) {
    onChange(value.map((line, i) => (i === index ? { ...line, ...updates } : line)))
  }

  return (
    <div className="space-y-3">
      {value.map((line, index) => {
        const selectedCode = cptCodes.find((c) => c.id === line.cptCodeId)
        void selectedCode
        const lineOptions = cptCodes
          .filter(
            (c) =>
              c.id === line.cptCodeId ||
              !value.some((v, i) => i !== index && v.cptCodeId === c.id)
          )
          .map((c) => ({
            value: c.id,
            label: `${c.code} — ${c.description}`,
            sublabel: c.code,
          }))

        return (
          <div key={index} className="flex items-end gap-3">
            <div className="flex-1">
              {index === 0 && <Label className="mb-1 block">CPT Code</Label>}
              <SearchCombobox
                options={lineOptions}
                value={line.cptCodeId}
                onValueChange={(v) => updateLine(index, { cptCodeId: v })}
                placeholder="Search CPT codes..."
                searchPlaceholder="Search by code or description..."
                onSearch={setQuery}
                loading={loading}
                disabled={!serviceTypeId}
              />
            </div>
            <div className="w-24">
              {index === 0 && <Label className="mb-1 block">Units</Label>}
              <Input
                type="number"
                min={1}
                value={line.units}
                onChange={(e) => updateLine(index, { units: parseInt(e.target.value) || 1 })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-700 hover:bg-red-50 mb-0"
              onClick={() => removeLine(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      {!serviceTypeId && (
        <p className="text-sm text-gray-500">Select a service type to see CPT codes</p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={addLine}
        disabled={!serviceTypeId}
      >
        <Plus className="h-4 w-4" />
        Add CPT Code
      </Button>
    </div>
  )
}
