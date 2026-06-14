'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { analyzeSpotify, getLoginUrl } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmotionChart } from '@/components/emotion-chart';
import { Music, Play, Loader2, ChevronLeft, RefreshCw, LogIn, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function SpotifyPage() {
  const [tracks, setTracks] = useState<any[]>([]);
  const [results, setResults] = useState<any | null>(null);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('spotify_token');
    setIsLoggedIn(!!token);
    setIsLoadingAuth(false);
  }, []);

  const fetchTracks = useCallback(async () => {
    const token = localStorage.getItem('spotify_token');
    if (!token) return;

    setIsRefreshing(true);
    try {
      const res = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        setIsLoggedIn(false);
        localStorage.removeItem('spotify_token');
        return;
      }

      const data = await res.json();
      setTracks(data.items || []);
    } catch (error) {
      console.error('Error fetching tracks:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchTracks();
    }
  }, [isLoggedIn, fetchTracks]);

  const { mutate: analyze } = useMutation({
    mutationFn: (trackId: string) => analyzeSpotify(trackId),
    onSuccess: (data) => {
      setResults(data);
      setAnalyzingIndex(null);
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || 'Track analysis error.';
      alert(errorMsg);
      setAnalyzingIndex(null);
      setActiveIndex(null);
    },
  });

  const handleAnalyze = (track: any, index: number) => {
    if (activeIndex === index) {
      setActiveIndex(null);
      setResults(null);
      return;
    }

    setResults(null);
    setActiveIndex(index);
    setAnalyzingIndex(index);
    analyze(track.id);
  };

  const handleConnect = async () => {
    try {
      localStorage.setItem('auth_redirect', '/spotify');
      const url = await getLoginUrl();
      window.location.href = url;
    } catch (e) {
      alert('Login error');
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6 transition-all md:max-w-6xl md:pt-12">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-500 md:text-lg"
        >
          <ChevronLeft size={16} className="md:h-6 md:w-6" /> Powrót
        </Link>

        {isLoggedIn && (
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTracks}
            disabled={isRefreshing}
            className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-500 md:h-10 md:w-10"
          >
            <RefreshCw
              size={16}
              className={cn(isRefreshing ? 'animate-spin' : '', 'md:h-5 md:w-5')}
            />
          </Button>
        )}
      </div>

      <header>
        <h2 className="text-2xl font-bold text-slate-800 md:text-4xl">Ostatnio słuchane</h2>
        <p className="text-sm text-slate-500 md:text-lg">
          {isLoggedIn
            ? 'Wybierz utwór ze Spotify do analizy emocji'
            : 'Połącz konto, aby zobaczyć historię'}
        </p>
      </header>

      {!isLoggedIn ? (
        <Card className="border-2 border-dashed border-slate-200 bg-slate-50 shadow-none md:p-10">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="rounded-full bg-white p-3 text-emerald-500 shadow-sm md:p-5">
              <LogIn size={24} className="md:h-8 md:w-8" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700 md:text-xl">Wymagane logowanie</h3>
              <p className="mt-1 max-w-[200px] text-xs text-slate-500 md:max-w-md md:text-sm">
                Aby pobrać Twoją historię słuchania, musisz połączyć konto Spotify.
              </p>
            </div>
            <Button
              onClick={handleConnect}
              className="gap-2 bg-emerald-500 text-white hover:bg-emerald-600 md:h-12 md:px-6 md:text-base"
            >
              Połącz ze Spotify <ExternalLink size={14} className="md:h-5 md:w-5" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-[1fr_450px]">
          <div className="space-y-3">
            {tracks.map((item: any, index: number) => {
              const isSelected = activeIndex === index;
              const isAnalyzing = analyzingIndex === index;

              return (
                <div key={`${item.track.id}-${index}`} className="flex flex-col gap-2">
                  <Card
                    className={cn(
                      'overflow-hidden border-none bg-white shadow-sm transition-all hover:shadow-md',
                      isSelected && 'shadow-md ring-2 ring-emerald-500'
                    )}
                  >
                    <CardContent className="flex items-center justify-between p-4 md:p-5">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 md:h-14 md:w-14">
                          {item.track.album.images?.[0] ? (
                            <img
                              src={
                                item.track.album.images[2]?.url || item.track.album.images[0].url
                              }
                              alt={item.track.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Music size={20} className="text-slate-400 md:h-6 md:w-6" />
                          )}
                        </div>
                        <div className="truncate">
                          <p className="truncate text-sm font-bold text-slate-800 md:text-base">
                            {item.track.name}
                          </p>
                          <p className="truncate text-[10px] text-slate-400 md:text-xs">
                            {item.track.artists[0].name}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleAnalyze(item.track, index)}
                        disabled={isAnalyzing}
                        size="sm"
                        variant={isSelected ? 'default' : 'secondary'}
                        className={cn(
                          'h-8 transition-colors md:h-10 md:px-4',
                          isSelected
                            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                            : 'bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-600'
                        )}
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isSelected ? (
                          'Ukryj'
                        ) : (
                          <Play size={14} className="md:h-4 md:w-4" />
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  {isSelected && results && (
                    <div className="animate-in slide-in-from-top-2 fade-in block duration-300 md:hidden">
                      <Card className="gap-0 overflow-hidden border-none bg-white p-0 shadow-xl">
                        <div className="border-b border-emerald-100 bg-emerald-50 p-4">
                          <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                            <Music size={16} /> Wynik analizy
                          </h3>
                        </div>
                        <CardContent className="p-6">
                          <div className="mb-6 flex w-full flex-col items-center">
                            <span className="mb-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold tracking-wider text-emerald-700 uppercase">
                              Dominująca: {results[0]?.tag}
                            </span>
                            <EmotionChart data={results} />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden md:block">
            <div className="sticky top-1/2 -translate-y-1/2">
              {results && activeIndex !== null ? (
                <div className="animate-in slide-in-from-right-4 fade-in duration-500">
                  <Card className="gap-0 overflow-hidden border-none bg-white p-0 shadow-2xl">
                    <div className="border-b border-emerald-100 bg-emerald-50 p-6">
                      <div className="mb-4 flex items-center gap-4">
                        <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-100 shadow-sm">
                          {tracks[activeIndex]?.track?.album?.images?.[0] ? (
                            <img
                              src={tracks[activeIndex].track.album.images[0].url}
                              alt="Cover"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Music size={32} className="text-emerald-600" />
                          )}
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="truncate text-xl font-bold text-emerald-900">
                            {tracks[activeIndex]?.track?.name}
                          </h3>
                          <p className="truncate text-sm font-medium text-emerald-700 opacity-80">
                            {tracks[activeIndex]?.track?.artists?.[0]?.name}
                          </p>
                        </div>
                      </div>
                      <h3 className="flex items-center gap-2 text-sm font-bold tracking-wide text-emerald-600 uppercase">
                        <Music size={16} /> Raport emocjonalny
                      </h3>
                    </div>
                    <CardContent className="p-8">
                      <div className="mb-2 flex w-full flex-col items-center">
                        <span className="mb-6 inline-block rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-bold tracking-widest text-emerald-700 uppercase shadow-sm">
                          {results[0]?.tag}
                        </span>
                        <div className="w-full">
                          <EmotionChart data={results} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex h-[400px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-slate-400">
                  <div className="mb-4 rounded-full bg-slate-100 p-6">
                    <Music size={48} className="text-slate-300" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-500">Brak aktywnej analizy</h3>
                  <p className="max-w-[250px] text-sm">
                    Kliknij przycisk <span className="font-bold text-slate-600">Play</span> przy
                    utworze z lewej strony, aby zobaczyć szczegółowy wykres emocji.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
