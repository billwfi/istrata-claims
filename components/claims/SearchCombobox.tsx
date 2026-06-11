"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Option {
  value: string
  label: string
  sublabel?: string
}

interface SearchComboboxProps {
  options: Option[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  loading?: boolean
  disabled?: boolean
}

export function SearchCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  onSearch,
  loading,
  disabled,
}: SearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedLabel, setSelectedLabel] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (selected) {
      setSelectedLabel(selected.label)
      if (!open) setQuery(selected.label)
    } else if (!value) {
      setSelectedLabel("")
      if (!open) setQuery("")
    }
  }, [open, selected, value])

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch?.(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, onSearch])

  function closeAndRestoreLabel() {
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setQuery(selectedLabel)
    }, 120)
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        placeholder={selectedLabel || placeholder}
        value={query}
        disabled={disabled}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current)
          setOpen(true)
          onSearch?.(query)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        onBlur={closeAndRestoreLabel}
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          setOpen(true)
          if (value) onValueChange("")
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && open && options[0]) {
            e.preventDefault()
            const option = options[0]
            setSelectedLabel(option.label)
            setQuery(option.label)
            onValueChange(option.value)
            setOpen(false)
          }
          if (e.key === "Escape") {
            setOpen(false)
            setQuery(selectedLabel)
          }
        }}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">{searchPlaceholder}</div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="py-4 text-center text-sm text-gray-500">Searching...</div>
            ) : options.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-500">No results found</div>
            ) : (
              options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left",
                    value === option.value && "bg-blue-50"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedLabel(option.label)
                    setQuery(option.label)
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100 text-blue-600" : "opacity-0"
                    )}
                  />
                  <div>
                    <div className="font-medium">{option.label}</div>
                    {option.sublabel && (
                      <div className="text-xs text-gray-500">{option.sublabel}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
