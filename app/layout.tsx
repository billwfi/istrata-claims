import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "iStrata Claims",
  description: "Affiliate claim submission portal for iStrata Management",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full" style={{ fontFamily: "'Calibri', 'Candara', 'Segoe UI', Optima, Arial, sans-serif" }}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
