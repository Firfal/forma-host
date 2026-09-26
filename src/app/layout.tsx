import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: `Formations en ligne — ${brand.name}`,
  metadataBase: new URL(brand.appUrl),
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
