'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getLoginUrl, getUserProfile } from '@/lib/api';
import { User, Music, ChevronLeft, LogOut, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface UserData {
  display_name: string;
  email: string;
  images: { url: string }[];
  product: string;
}

export default function AccountPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('spotify_token');

      if (token) {
        setIsLoggedIn(true);
        try {
          const data = await getUserProfile();
          setUserData(data);
        } catch (error) {
          console.error('Error fetching profile (token might be expired)', error);
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const handleConnectSpotify = async () => {
    try {
      const targetPath = isLoggedIn ? '/spotify' : '/account';
      localStorage.setItem('auth_redirect', targetPath);

      const url = await getLoginUrl();
      window.location.href = url;
    } catch (error) {
      alert('Failed to get login URL.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('spotify_token');
    setIsLoggedIn(false);
    setUserData(null);
  };

  return (
    <div className="mx-auto max-w-md space-y-6 p-6 transition-all md:max-w-3xl md:space-y-10 md:pt-20">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-emerald-500 md:text-lg"
      >
        <ChevronLeft className="h-4 w-4 md:h-6 md:w-6" /> Powrót
      </Link>

      <header>
        <h2 className="text-2xl font-bold text-slate-800 md:text-5xl">Twoje Konto</h2>
        <p className="text-sm text-slate-500 md:mt-2 md:text-xl">
          Zarządzaj połączeniem ze Spotify
        </p>
      </header>

      <Card className="border-none bg-white shadow-xl shadow-slate-200/50 md:shadow-2xl">
        <CardContent className="space-y-6 p-6 md:space-y-10 md:p-10">
          <div className="flex items-center gap-4 md:gap-8">
            <div
              className={cn(
                'relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full border transition-colors',
                'h-16 w-16 md:h-32 md:w-32',
                isLoggedIn
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-500'
                  : 'border-slate-100 bg-slate-50 text-slate-400'
              )}
            >
              {userData?.images?.[0]?.url ? (
                <img
                  src={userData.images[0].url}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-8 w-8 md:h-16 md:w-16" />
              )}
            </div>

            <div className="flex-1">
              {isLoading ? (
                <div className="space-y-2">
                  <div className="h-5 w-32 animate-pulse rounded bg-slate-200 md:h-8 md:w-48"></div>
                  <div className="h-3 w-20 animate-pulse rounded bg-slate-200 md:h-5 md:w-32"></div>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-slate-800 md:text-4xl md:leading-tight">
                    {userData?.display_name || 'Użytkownik'}
                  </h3>

                  {isLoggedIn ? (
                    <div className="flex flex-wrap items-center gap-2 md:mt-2 md:gap-3">
                      <p className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 md:px-4 md:py-1 md:text-sm">
                        Sesja aktywna
                      </p>
                      {userData?.product === 'premium' && (
                        <span className="text-[10px] font-bold tracking-wide text-amber-500 uppercase md:text-sm">
                          PREMIUM
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 md:mt-2 md:px-4 md:py-1 md:text-sm">
                      Niepołączony
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="space-y-3 md:space-y-5">
            <h4 className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase md:text-sm">
              Usługi zewnętrzne
            </h4>

            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:bg-slate-100/50 md:p-6">
              <div className="flex items-center gap-3 md:gap-6">
                <div
                  className={cn(
                    'rounded-xl bg-white p-2 shadow-sm md:p-4',
                    isLoggedIn ? 'text-emerald-500' : 'text-slate-400'
                  )}
                >
                  <Music className="h-5 w-5 md:h-8 md:w-8" />
                </div>
                <div className="flex flex-col md:gap-1">
                  <span className="text-sm font-bold text-slate-700 md:text-xl">Spotify API</span>
                  {!isLoggedIn && (
                    <span className="text-[10px] text-slate-400 md:text-sm">
                      Wymagane do pobrania historii
                    </span>
                  )}
                </div>
              </div>

              <Button
                onClick={handleConnectSpotify}
                variant="ghost"
                size="sm"
                className="gap-2 text-xs font-bold text-emerald-600 hover:bg-emerald-100/50 md:h-12 md:px-6 md:text-base"
              >
                {isLoggedIn ? 'Odśwież token' : 'Połącz'}{' '}
                <ExternalLink className="h-3.5 w-3.5 md:h-5 md:w-5" />
              </Button>
            </div>
          </div>

          {isLoggedIn && (
            <div className="animate-in fade-in slide-in-from-top-2 border-t border-slate-50 pt-4 md:pt-8">
              <Button
                onClick={handleLogout}
                variant="destructive"
                className="w-full gap-2 border-none bg-red-50 font-bold text-red-600 shadow-none hover:bg-red-100 md:h-14 md:text-lg"
              >
                <LogOut className="h-4 w-4 md:h-6 md:w-6" /> Wyloguj się
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
