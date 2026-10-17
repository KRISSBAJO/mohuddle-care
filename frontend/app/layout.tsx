import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import "../src/app/globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
export const metadata: Metadata = { title: "Mohuddle", description: "Care operations for disability services agencies" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${sans.variable}`}><body>{children}</body></html>;
}
