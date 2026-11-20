
import type { Metadata } from "next";
import Navbar from "../components/Navbar";
import NavbarAuthControls from "../components/NavbarAuthControls";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recipe Hub",
  description:
    "Turn cooking videos into recipes, discover new meals, and save your favorites.",
};

const authConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET &&
    process.env.AUTH_SECRET
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FAF9F6] font-sans text-stone-900 antialiased">
        <Navbar
          authControls={<NavbarAuthControls enabled={authConfigured} />}
        />

        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
