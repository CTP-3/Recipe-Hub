"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  { name: "Home", href: "/home" },
  { name: "My Recipes", href: "/my-recipes" },
];

export default function Navbar({ authControls }: { authControls: ReactNode }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-stone-200 bg-emerald-800">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          href="/home"
          className="text-2xl font-bold text-green-100 hover:text-white"
        >
          Recipe Hub
        </Link>

        <div className="flex items-center gap-6">
          <div className="flex gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition ${
                  pathname === link.href
                    ? "text-white"
                    : "text-stone-300 hover:text-white"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>
          {authControls}
        </div>
      </div>
    </nav>
  );
}