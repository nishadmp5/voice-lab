import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: "Voice Lab — Find your other voice",
  description:
    "Your personal voice playground. Record, tune, and export audio, right in your browser.",
  applicationName: "Voice Lab",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Voice Lab",
  },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#101212",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
