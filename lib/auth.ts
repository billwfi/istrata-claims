import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { authConfig } from "@/lib/auth.config"

function testLoginAllowed() {
  return process.env.ALLOW_TEST_LOGIN === "1" || process.env.NODE_ENV === "development"
}

function getTestUser(email: string, password: string) {
  if (!testLoginAllowed()) return null

  if (email === "admin@istrata.com" && password === "admin123!") {
    return {
      id: "test-admin",
      email,
      name: "iStrata Test Admin",
      role: "ADMIN",
      affiliateId: null,
    }
  }

  return null
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = String(credentials.email).trim().toLowerCase()
        const password = String(credentials.password)

        try {
          const user = await db.user.findUnique({
            where: { email },
          })

          if (user) {
            const passwordMatch = await bcrypt.compare(
              password,
              user.password
            )

            if (!passwordMatch) return null

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              affiliateId: user.affiliateId,
            }
          }
        } catch (err) {
          if (!testLoginAllowed()) throw err
        }

        return getTestUser(email, password)
      },
    }),
  ],
})
