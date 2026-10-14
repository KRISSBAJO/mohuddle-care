import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Inter } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
// The dashboard reads in Inter, which stays clear at small sizes and in tables.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${site.name} | ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { title: site.legalName, description: site.description, type: "website" },
};

export const viewport: Viewport = { themeColor: "#fbfaf6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${bricolage.variable} ${geist.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
