"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, LogOut, Settings, MapPin } from "lucide-react"

interface ProviderNavProps {
  userName: string
  isAdmin: boolean
}

export function ProviderNav({ userName, isAdmin }: ProviderNavProps) {
  const pathname = usePathname()

  return (
    <nav className="border-b px-4 py-2 bg-white shadow-sm" style={{ borderColor: "#bcd9e5" }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/locations">
            <Image src="/logo.svg" alt="iStrata Management" width={150} height={44} priority />
          </Link>
          <Link
            href="/locations"
            className="flex items-center gap-1 text-sm font-medium transition-colors"
            style={{ color: pathname.startsWith("/locations") ? "#2D7A96" : "#4d8ea8" }}
          >
            <MapPin className="h-4 w-4" />
            Locations
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: pathname.startsWith("/admin") ? "#2D7A96" : "#4d8ea8" }}
            >
              <Settings className="h-4 w-4" />
              Admin
            </Link>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({ variant: "ghost" }) + " gap-1"}
            style={{ color: "#1D5570" }}
          >
            {userName}
            <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}
