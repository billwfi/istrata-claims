import type { ClaimStatus } from "@/lib/generated/prisma/client"

const statusConfig: Record<ClaimStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SUBMITTED: { label: "Submitted", variant: "default" },
  IN_REVIEW: { label: "In Review", variant: "default" },
  APPROVED: { label: "Approved", variant: "default" },
  DENIED: { label: "Denied", variant: "destructive" },
  NEEDS_MORE_INFO: { label: "Needs Info", variant: "outline" },
  PAID: { label: "Paid", variant: "default" },
}

const statusColors: Record<ClaimStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  IN_REVIEW: "bg-yellow-100 text-yellow-700 border-yellow-200",
  APPROVED: "bg-green-100 text-green-700 border-green-200",
  DENIED: "bg-red-100 text-red-700 border-red-200",
  NEEDS_MORE_INFO: "bg-orange-100 text-orange-700 border-orange-200",
  PAID: "bg-emerald-100 text-emerald-700 border-emerald-200",
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const config = statusConfig[status]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColors[status]}`}
    >
      {config.label}
    </span>
  )
}
