"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

export function ClaimsDateFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const dateFrom = searchParams.get("dateFrom") ?? ""
  const dateTo = searchParams.get("dateTo") ?? ""

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  function clear() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("dateFrom")
    params.delete("dateTo")
    router.replace(`${pathname}?${params.toString()}`)
  }

  const hasFilter = dateFrom || dateTo

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1">
        <Label className="text-xs text-gray-500">Date of Service From</Label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => update("dateFrom", e.target.value)}
          className="w-40 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-gray-500">To</Label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => update("dateTo", e.target.value)}
          className="w-40 text-sm"
        />
      </div>
      {hasFilter && (
        <Button variant="ghost" size="sm" onClick={clear} className="gap-1 text-gray-500">
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  )
}
