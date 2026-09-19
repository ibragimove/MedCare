import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NativeBridge from "@/components/NativeBridge";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedCare — Aktiv Patronaj",
  description:
    "Statsionardan chiqarilgan bemorlarni hududiy hamshira va oilaviy shifokorga avtomatik ulovchi AI platforma",
  applicationName: "MedCare",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MedCare",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uz"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
