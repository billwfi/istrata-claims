import { auth } from "@/lib/auth"
import {
  encryptNbmSqlPassword,
  getNbmSqlPasswordFromCookies,
  getNbmSqlSessionCookieOptions,
  NBM_DB_SESSION_COOKIE,
} from "@/lib/nbm-db-session"
import { hasNbmSqlEnvironmentPassword, testNbmConnection } from "@/lib/nbm-sql"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (hasNbmSqlEnvironmentPassword()) {
    return NextResponse.json({ configured: true, source: "environment" })
  }

  const password = await getNbmSqlPasswordFromCookies()
  return NextResponse.json({ configured: Boolean(password), source: password ? "browser-session" : null })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const password = typeof body.password === "string" ? body.password : ""
  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 })
  }

  try {
    await testNbmConnection(password)
  } catch {
    return NextResponse.json({ error: "Unable to connect with that password" }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set(
    NBM_DB_SESSION_COOKIE,
    encryptNbmSqlPassword(password),
    getNbmSqlSessionCookieOptions()
  )

  return NextResponse.json({ configured: true, source: "browser-session" })
}

export async function DELETE() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cookieStore = await cookies()
  cookieStore.delete(NBM_DB_SESSION_COOKIE)
  return NextResponse.json({ configured: hasNbmSqlEnvironmentPassword() })
}
