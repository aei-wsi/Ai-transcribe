import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recall — save-to-transcribe knowledge library",
  description:
    "Turn your saved YouTube/social videos and voice notes into a searchable, topic-tagged library.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#b45309",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
