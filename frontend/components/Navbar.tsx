'use client';

import Link from 'next/link';
import { Menu, Heart, X } from 'lucide-react';
import { useState } from 'react';

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { href: '/spotify', label: 'Analiza Spotify' },
    { href: '/upload', label: 'Prześlij plik' },
    { href: '/account', label: 'Moje konto' },
  ];

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          onClick={() => setIsMenuOpen(false)}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-200">
            <Heart className="h-5 w-5" fill="currentColor" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg leading-none font-bold tracking-tight text-slate-800">
              Emotify
            </span>
          </div>
        </Link>

        <button
          className="p-2 text-slate-600 transition-colors hover:text-emerald-500 md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
        </button>

        <div className="hidden gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-slate-600 transition-colors hover:text-emerald-500"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {isMenuOpen && (
        <div className="animate-in slide-in-from-top-2 absolute top-16 left-0 flex w-full flex-col border-b border-slate-200 bg-white p-6 shadow-xl md:hidden">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="text-base font-bold text-slate-700 hover:text-emerald-500"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="my-4 h-px bg-slate-100" />
          <p className="text-center text-[10px] font-medium text-slate-400">Emotify</p>
        </div>
      )}
    </nav>
  );
}
