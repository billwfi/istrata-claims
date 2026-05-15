"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
  Building2,
  MapPin,
  Users,
  Stethoscope,
  UserRound,
  Layers,
  Code2,
  FileSearch,
  LogOut,
  LayoutDashboard,
  ClipboardList,
} from "lucide-react"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/affiliates", label: "Affiliates", icon: Building2 },
  { href: "/admin/locations", label: "Locations", icon: MapPin },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/providers", label: "Providers", icon: Stethoscope },
  { href: "/admin/patients", label: "Patients", icon: UserRound },
  { href: "/admin/service-types", label: "Service Types", icon: Layers },
  { href: "/admin/cpt-codes", label: "CPT Codes", icon: Code2 },
  { href: "/admin/diagnosis-codes", label: "Diagnosis Codes", icon: FileSearch },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <div className="w-56 min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <Link href="/locations" className="flex items-center gap-2 text-white font-semibold">
          <ClipboardList className="h-5 w-5 text-blue-400" />
          iStrata Claims
        </Link>
        <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-700">
        <Link
          href="/locations"
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          <MapPin className="h-4 w-4" />
          Provider Portal
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
