import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ProviderNav } from "@/components/layout/ProviderNav"

export default async function ProviderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ProviderNav
        userName={session.user.name}
        isAdmin={session.user.role === "ADMIN"}
      />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  )
}
