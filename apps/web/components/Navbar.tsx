"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { name: "Home", href: "/home" },
  { name: "Discover", href: "/discover" },
  { name: "Create", href: "/upload" },
  { name: "My Recipes", href: "/my-recipes" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          href="/home"
          className="text-2xl font-bold text-emerald-900"
        >
          Recipe Hub
        </Link>

        <div className="flex gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition ${
                pathname === link.href
                  ? "text-emerald-800"
                  : "text-stone-600 hover:text-emerald-800"
              }`}
            >
              {link.name}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}