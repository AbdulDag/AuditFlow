import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AuditProvider } from "@/context/AuditContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AuditFlow — Reproducibility Auditor for ML Research",
  description:
    "The first deterministic auditor for ML research reproducibility. We don't summarize papers — we run them, score them, and expose exactly why they break.",
  keywords: [
    "reproducibility",
    "scientific audit",
    "arxiv",
    "docker sandbox",
    "R-index",
  ],
  openGraph: {
    title: "AuditFlow",
    description:
      "Run the code, trace failures, and score reproducibility — backed by Azure AI and Docker.",
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
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full`}
      >
        <body className="min-h-full antialiased">
          <AuditProvider>{children}</AuditProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
