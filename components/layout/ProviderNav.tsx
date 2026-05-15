"use client"

import Link from "next/link"
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
    <nav className="border-b bg-white px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/locations" className="font-semibold text-gray-900">
            iStrata Claims
          </Link>
          <Link
            href="/locations"
            className={`flex items-center gap-1 text-sm ${
              pathname.startsWith("/locations")
                ? "text-blue-600 font-medium"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <MapPin className="h-4 w-4" />
            Locations
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-1 text-sm ${
                pathname.startsWith("/admin")
                  ? "text-blue-600 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Settings className="h-4 w-4" />
              Admin
            </Link>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: "ghost" }) + " gap-1"}>
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
