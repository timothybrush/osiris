import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OSIRIS — Global Intelligence Platform",
  description: "Open-source geospatial intelligence platform. Real-time tracking of aircraft, satellites, maritime vessels, CCTV, seismic events, wildfires, and global conflicts. The open-source Palantir alternative.",
  keywords: ["OSINT", "intelligence", "geospatial", "tracking", "aircraft", "satellites", "CCTV", "open source", "palantir alternative", "real-time", "surveillance", "analytics"],
  authors: [{ name: "Osiris Project" }],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/osiris-icon.png', type: 'image/png' },
    ],
    apple: '/osiris-icon.png',
  },
  openGraph: {
    title: "OSIRIS — Global Intelligence Platform",
    description: "Real-time OSINT dashboard for global situational awareness. Track aircraft, satellites, CCTV, earthquakes, wildfires & conflicts.",
    type: "website",
    siteName: "OSIRIS",
  },
  twitter: {
    card: "summary_large_image",
    title: "OSIRIS — Global Intelligence Platform",
    description: "Open-source Palantir alternative. Real-time OSINT dashboard.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/osiris-icon.png" />
        <meta name="theme-color" content="#06060C" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
