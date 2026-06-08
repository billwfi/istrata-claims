import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import { cookies } from "next/headers"

export const NBM_DB_SESSION_COOKIE = "nbm_sql_session"

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

function getSessionSecret() {
  return (
    process.env.NBM_SQL_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "istrata-nbm-sql-session-dev-secret"
  )
}

function getKey() {
  return createHash("sha256").update(getSessionSecret()).digest()
}

export function encryptNbmSqlPassword(password: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
}

export function decryptNbmSqlPassword(value?: string | null) {
  if (!value) return null

  try {
    const [version, iv, tag, encrypted] = value.split(".")
    if (version !== "v1" || !iv || !tag || !encrypted) return null

    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return null
  }
}

export async function getNbmSqlPasswordFromCookies() {
  const cookieStore = await cookies()
  return decryptNbmSqlPassword(cookieStore.get(NBM_DB_SESSION_COOKIE)?.value)
}

export function getNbmSqlSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
