"use client"

import Link from "next/link"
import Image from "next/image"
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
    <div className="w-60 min-h-screen flex flex-col" style={{ backgroundColor: "#1D5570" }}>
      <div className="px-4 py-5 border-b" style={{ borderColor: "#255f7a" }}>
        <Link href="/locations">
          <Image src="/logo.svg" alt="iStrata Management" width={180} height={52} priority />
        </Link>
        <p className="text-xs mt-2 font-medium tracking-wide" style={{ color: "#6BA8BE" }}>Admin Panel</p>
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
                  ? "text-white"
                  : "text-blue-100/80 hover:text-white"
              )}
              style={isActive ? { backgroundColor: "#2D7A96" } : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t" style={{ borderColor: "#255f7a" }}>
        <Link
          href="/locations"
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-blue-100/80 hover:text-white transition-colors"
        >
          <MapPin className="h-4 w-4" />
          Provider Portal
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-blue-100/80 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
