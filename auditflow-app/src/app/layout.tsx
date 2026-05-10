import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { AuditProvider } from "@/context/AuditContext";

export const metadata: Metadata = {
  title: "AuditFlow — Reproducibility Intelligence Platform",
  description:
    "End the reproducibility crisis. AuditFlow automatically audits scientific papers, resolves dependencies, executes code in sandboxed Docker environments, and generates a zero-hallucination Reproducibility Index.",
  keywords: ["reproducibility", "scientific audit", "arxiv", "docker sandbox", "R-index"],
  openGraph: {
    title: "AuditFlow",
    description: "Automate the complex. Verify the science.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="antialiased">
          <AuditProvider>
            {children}
          </AuditProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
