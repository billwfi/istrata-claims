import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  const isLoggedIn = !!session
  const isAdmin = session?.user?.role === "ADMIN"

  // Redirect logged-in users away from login
  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/locations", req.url))
  }

  // Protect provider routes
  if (
    (pathname.startsWith("/locations") || pathname.startsWith("/admin")) &&
    !isLoggedIn
  ) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Protect admin routes
  if (pathname.startsWith("/admin") && !isAdmin) {
    return NextResponse.redirect(new URL("/locations", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/login", "/locations/:path*", "/admin/:path*"],
}
