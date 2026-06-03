import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === "development" ? "istrata-claims-dev-secret" : undefined),
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
        token.affiliateId = (user as { affiliateId: string | null }).affiliateId
      }
      return token
    },
    session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.affiliateId = token.affiliateId as string | null
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig
