'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Music, Upload, User } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="mx-auto max-w-md space-y-6 p-6 transition-all md:flex md:max-w-[1400px] md:flex-col md:justify-start md:space-y-20 md:p-12 md:pt-24">
      <header className="py-4 text-center">
        <h2 className="text-3xl font-bold text-balance text-slate-800 md:text-6xl md:font-extrabold md:whitespace-nowrap">
          Odkryj emocje ukryte w Twojej muzyce
        </h2>
      </header>

      <div className="flex flex-col gap-4 md:grid md:grid-cols-3 md:gap-10">
        <Link href="/spotify" className="group">
          <Card className="border-none bg-emerald-500 text-white shadow-lg transition-all duration-300 active:scale-95 md:h-full md:shadow-xl md:hover:-translate-y-4 md:hover:shadow-2xl md:hover:shadow-emerald-500/30">
            <CardContent className="flex flex-row items-center gap-4 p-6 md:h-[450px] md:flex-col md:justify-center md:gap-8 md:p-10 md:text-center">
              <div className="rounded-full bg-white/20 p-3 transition-transform md:p-8 md:group-hover:scale-110">
                <Music className="h-6 w-6 md:h-20 md:w-20" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold md:text-4xl">Analiza Spotify</h3>
                <p className="text-xs opacity-80 md:text-lg md:opacity-90">
                  Analizuj ostatnio słuchane utwory
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/upload" className="group">
          <Card className="border-none bg-sky-500 text-white shadow-lg transition-all duration-300 active:scale-95 md:h-full md:shadow-xl md:hover:-translate-y-4 md:hover:shadow-2xl md:hover:shadow-sky-500/30">
            <CardContent className="flex flex-row items-center gap-4 p-6 md:h-[450px] md:flex-col md:justify-center md:gap-8 md:p-10 md:text-center">
              <div className="rounded-full bg-white/20 p-3 transition-transform md:p-8 md:group-hover:scale-110">
                <Upload className="h-6 w-6 md:h-20 md:w-20" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold md:text-4xl">Prześlij plik</h3>
                <p className="text-xs opacity-80 md:text-lg md:opacity-90">
                  Analiza pojedynczego utworu
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/account" className="group">
          <Card className="border-none bg-slate-800 text-white shadow-lg transition-all duration-300 active:scale-95 md:h-full md:shadow-xl md:hover:-translate-y-4 md:hover:shadow-2xl md:hover:shadow-slate-800/30">
            <CardContent className="flex flex-row items-center gap-4 p-6 md:h-[450px] md:flex-col md:justify-center md:gap-8 md:p-10 md:text-center">
              <div className="rounded-full bg-white/20 p-3 transition-transform md:p-8 md:group-hover:scale-110">
                <User className="h-6 w-6 md:h-20 md:w-20" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold md:text-4xl">Moje konto</h3>
                <p className="text-xs opacity-80 md:text-lg md:opacity-90">
                  Zarządzaj połączeniem ze Spotify
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
