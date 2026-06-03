"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SearchCombobox } from "@/components/claims/SearchCombobox"
import { Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface NewRxOrderFormProps {
  locationId: string
}

interface PatientOption {
  id: string
  firstName: string
  lastName: string
  memberId?: string | null
}

interface ProviderOption {
  id: string
  name: string
  npi?: string | null
}

interface ProductOption {
  id: string
  itemName: string
  itemSku?: string | null
  itemType?: string | null
  retailCost?: number | null
  itemCost?: number | null
  copaymentTier?: number | null
  clinicalTier?: string | null
  productFormType?: string | null
  nab?: string | null
}

interface RxItem {
  productId: string
  productName: string
  productSku: string
  therapyType: string
  productFormType: string
  dosage: string
  numberOfBottles: string
  refillFrequencyDays: string
  refillDurationMonths: string
  automaticRefill: boolean
  copayAmount: string
  retailCost: string
  nextFillDate: string
  processRefillDate: string
}

const emptyItem = (): RxItem => ({
  productId: "",
  productName: "",
  productSku: "",
  therapyType: "",
  productFormType: "",
  dosage: "",
  numberOfBottles: "1",
  refillFrequencyDays: "",
  refillDurationMonths: "",
  automaticRefill: true,
  copayAmount: "",
  retailCost: "",
  nextFillDate: "",
  processRefillDate: "",
})

export function NewRxOrderForm({ locationId }: NewRxOrderFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [patientId, setPatientId] = useState("")
  const [providerId, setProviderId] = useState("")
  const [patientEmail, setPatientEmail] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [shippingAddress1, setShippingAddress1] = useState("")
  const [shippingAddress2, setShippingAddress2] = useState("")
  const [shippingCity, setShippingCity] = useState("")
  const [shippingState, setShippingState] = useState("")
  const [shippingZip, setShippingZip] = useState("")
  const [deliveryMethod, setDeliveryMethod] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<RxItem[]>([emptyItem()])

  const [patients, setPatients] = useState<PatientOption[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [patientLoading, setPatientLoading] = useState(false)
  const [providerLoading, setProviderLoading] = useState(false)
  const [productLoading, setProductLoading] = useState(false)

  const handlePatientSearch = useCallback((q: string) => {
    setPatientLoading(true)
    fetch(`/api/patients?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setPatients(data)
        setPatientLoading(false)
      })
      .catch(() => {
        setPatients([])
        setPatientLoading(false)
      })
  }, [])

  const handleProviderSearch = useCallback((q: string) => {
    setProviderLoading(true)
    fetch(`/api/locations/${locationId}/providers?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setProviders(data)
        setProviderLoading(false)
      })
  }, [locationId])

  const handleProductSearch = useCallback((q: string) => {
    setProductLoading(true)
    fetch(`/api/products?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(Array.isArray(data) ? data : [])
        setProductLoading(false)
      })
      .catch(() => {
        setProducts([])
        setProductLoading(false)
      })
  }, [])

  useEffect(() => {
    handlePatientSearch("")
    handleProviderSearch("")
    handleProductSearch("")
  }, [handlePatientSearch, handleProviderSearch, handleProductSearch])

  function updateItem(index: number, patch: Partial<RxItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function removeItem(index: number) {
    setItems((current) => current.length === 1 ? current : current.filter((_, i) => i !== index))
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId)
    if (!product) {
      updateItem(index, { productId: "" })
      return
    }

    updateItem(index, {
      productId: product.id,
      productName: product.itemName,
      productSku: product.itemSku || "",
      therapyType: product.itemType || product.clinicalTier || "",
      productFormType: product.productFormType || "",
      copayAmount: product.copaymentTier == null ? "" : String(product.copaymentTier),
      retailCost: product.retailCost == null ? "" : String(product.retailCost),
    })
  }

  async function submit() {
    if (!patientId || !providerId) {
      toast.error("Patient and provider are required")
      return
    }

    const validItems = items.filter((item) => item.productName.trim())
    if (!validItems.length) {
      toast.error("Add at least one product")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/locations/${locationId}/rx-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          providerId,
          patientEmail: patientEmail.trim() || null,
          patientPhone: patientPhone.trim() || null,
          shippingAddress1: shippingAddress1.trim() || null,
          shippingAddress2: shippingAddress2.trim() || null,
          shippingCity: shippingCity.trim() || null,
          shippingState: shippingState.trim() || null,
          shippingZip: shippingZip.trim() || null,
          deliveryMethod: deliveryMethod.trim() || null,
          notes: notes.trim() || null,
          items: validItems.map((item) => ({
            ...item,
            productName: item.productName.trim(),
            productId: item.productId || null,
            productSku: item.productSku.trim() || null,
            therapyType: item.therapyType.trim() || null,
            productFormType: item.productFormType.trim() || null,
            dosage: item.dosage.trim() || null,
            numberOfBottles: item.numberOfBottles ? Number(item.numberOfBottles) : null,
            refillFrequencyDays: item.refillFrequencyDays ? Number(item.refillFrequencyDays) : null,
            refillDurationMonths: item.refillDurationMonths ? Number(item.refillDurationMonths) : null,
            copayAmount: item.copayAmount ? Number(item.copayAmount) : null,
            retailCost: item.retailCost ? Number(item.retailCost) : null,
          })),
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Unable to submit RX order")

      toast.success(`RX order ${data.orderNumber} submitted`)
      router.push(`/locations/${locationId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Patient <span className="text-red-500">*</span></Label>
            <SearchCombobox
              options={patients.map((p) => ({
                value: p.id,
                label: `${p.lastName}, ${p.firstName}`,
                sublabel: p.memberId ? `Member: ${p.memberId}` : undefined,
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
            <Label>Provider <span className="text-red-500">*</span></Label>
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
            <Label htmlFor="patient-email">Patient email</Label>
            <Input id="patient-email" type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-phone">Patient phone</Label>
            <Input id="patient-phone" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Shipping</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ship-address-1">Address</Label>
              <Input id="ship-address-1" value={shippingAddress1} onChange={(e) => setShippingAddress1(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-address-2">Address 2</Label>
              <Input id="ship-address-2" value={shippingAddress2} onChange={(e) => setShippingAddress2(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-city">City</Label>
              <Input id="ship-city" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ship-state">State</Label>
                <Input id="ship-state" value={shippingState} onChange={(e) => setShippingState(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ship-zip">ZIP</Label>
                <Input id="ship-zip" value={shippingZip} onChange={(e) => setShippingZip(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-method">Delivery method</Label>
              <Input id="delivery-method" placeholder="Mail, pickup, courier" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Products</h2>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setItems((current) => [...current, emptyItem()])}>
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="rounded-lg border bg-white p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">Product {index + 1}</h3>
                  <Button type="button" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => removeItem(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Product name <span className="text-red-500">*</span></Label>
                    <SearchCombobox
                      options={products.map((p) => ({
                        value: p.id,
                        label: p.itemName,
                        sublabel: [
                          p.itemSku ? `SKU: ${p.itemSku}` : null,
                          p.itemType,
                          p.productFormType,
                        ].filter(Boolean).join(" / ") || undefined,
                      }))}
                      value={item.productId}
                      onValueChange={(v) => selectProduct(index, v ?? "")}
                      placeholder="Search product master..."
                      searchPlaceholder="Type product name or SKU..."
                      onSearch={handleProductSearch}
                      loading={productLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input value={item.productSku} onChange={(e) => updateItem(index, { productSku: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Therapy type</Label>
                    <Input value={item.therapyType} onChange={(e) => updateItem(index, { therapyType: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Product form</Label>
                    <Input value={item.productFormType} onChange={(e) => updateItem(index, { productFormType: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Dosage</Label>
                    <Input value={item.dosage} onChange={(e) => updateItem(index, { dosage: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Bottles</Label>
                    <Input type="number" min="1" value={item.numberOfBottles} onChange={(e) => updateItem(index, { numberOfBottles: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Refill frequency days</Label>
                    <Input type="number" min="0" value={item.refillFrequencyDays} onChange={(e) => updateItem(index, { refillFrequencyDays: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Refill duration months</Label>
                    <Input type="number" min="0" value={item.refillDurationMonths} onChange={(e) => updateItem(index, { refillDurationMonths: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Copay</Label>
                    <Input type="number" min="0" step="0.01" value={item.copayAmount} onChange={(e) => updateItem(index, { copayAmount: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Retail cost</Label>
                    <Input type="number" min="0" step="0.01" value={item.retailCost} onChange={(e) => updateItem(index, { retailCost: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Next fill date</Label>
                    <Input type="date" value={item.nextFillDate} onChange={(e) => updateItem(index, { nextFillDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Process refill date</Label>
                    <Input type="date" value={item.processRefillDate} onChange={(e) => updateItem(index, { processRefillDate: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 pt-7">
                    <input
                      type="checkbox"
                      checked={item.automaticRefill}
                      onChange={(e) => updateItem(index, { automaticRefill: e.target.checked })}
                    />
                    Automatic refill
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" disabled={saving} onClick={() => router.push(`/locations/${locationId}`)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} className="gap-2" onClick={submit}>
            <Send className="h-4 w-4" />
            Submit RX Order
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
