import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  const isLoggedIn = !!session
  const isAdmin = session?.user?.role === "ADMIN"

  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/locations", req.url))
  }

  if (
    (pathname.startsWith("/locations") || pathname.startsWith("/admin")) &&
    !isLoggedIn
  ) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (pathname.startsWith("/admin") && !isAdmin) {
    return NextResponse.redirect(new URL("/locations", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/login", "/locations/:path*", "/admin/:path*"],
}
