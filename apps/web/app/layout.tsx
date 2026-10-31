
import type { Metadata } from "next";
import Navbar from "../components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recipe Hub",
  description:
    "Turn cooking videos into recipes, discover new meals, and save your favorites.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FAF9F6] font-sans text-stone-900 antialiased">
        <Navbar />

        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
