'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { analyzeFile } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { EmotionChart } from '@/components/emotion-chart';
import { Upload, Loader2, Music, ChevronLeft, FileAudio } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Emotion {
  tag: string;
  confidence: number;
}

export default function UploadPage() {
  const [results, setResults] = useState<Emotion[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: analyzeFile,
    onSuccess: (data) => setResults(data),
    onError: () => alert('File analysis error.'),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setResults(null);
      mutate(file);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 p-6 transition-all md:max-w-6xl md:pt-12">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-emerald-500 md:text-lg"
      >
        <ChevronLeft size={16} className="md:h-6 md:w-6" /> Powrót do menu
      </Link>

      <header>
        <h2 className="text-2xl font-bold text-slate-800 md:text-4xl">Analiza pliku MP3</h2>
        <p className="text-sm text-slate-500 md:text-lg">
          Wybierz utwór z dysku, aby poznać jego profil emocjonalny
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-[1fr_450px]">
        <div>
          <Card className="border-2 border-dashed border-slate-200 bg-white shadow-none transition-colors hover:border-sky-400">
            <CardContent className="flex flex-col justify-center p-8 text-center md:min-h-[400px] md:p-12">
              <input
                type="file"
                id="manual-upload"
                className="hidden"
                accept=".mp3,.wav,.ogg"
                onChange={handleFile}
                disabled={isPending}
              />
              <label
                htmlFor="manual-upload"
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-4 md:h-full md:gap-6',
                  isPending && 'cursor-not-allowed opacity-50'
                )}
              >
                <div className="rounded-full bg-sky-50 p-4 text-sky-500 md:p-8">
                  {isPending ? (
                    <Loader2 className="h-8 w-8 animate-spin md:h-16 md:w-16" />
                  ) : fileName ? (
                    <FileAudio size={32} className="md:h-16 md:w-16" />
                  ) : (
                    <Upload size={32} className="md:h-16 md:w-16" />
                  )}
                </div>
                <div className="space-y-1 md:space-y-2">
                  <p className="font-bold text-slate-700 md:text-2xl">
                    {isPending
                      ? 'Analizowanie utworu...'
                      : fileName
                        ? 'Wybrano plik'
                        : 'Kliknij, aby przesłać'}
                  </p>
                  <p className="mx-auto max-w-[200px] truncate text-xs text-slate-400 md:max-w-md md:text-base">
                    {fileName ? fileName : 'MP3 lub WAV (max 16MB)'}
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          {results && (
            <div className="animate-in fade-in slide-in-from-bottom-4 mt-6 duration-500 md:hidden">
              <Card className="gap-0 overflow-hidden border-none bg-white p-0 shadow-xl">
                <div className="border-b border-sky-100 bg-sky-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-sky-800">
                    <Music size={16} /> Wynik analizy
                  </h3>
                </div>
                <CardContent className="p-6">
                  <div className="mb-6 flex flex-col items-center">
                    <span className="mb-2 inline-block rounded-full bg-sky-100 px-3 py-1 text-xs font-bold tracking-wider text-sky-700 uppercase">
                      Dominująca: {results[0]?.tag}
                    </span>
                    <EmotionChart data={results} />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="hidden md:block">
          {results ? (
            <div className="animate-in slide-in-from-right-4 fade-in duration-500">
              <Card className="gap-0 overflow-hidden border-none bg-white p-0 shadow-2xl">
                <div className="border-b border-sky-100 bg-sky-50 p-6">
                  <div className="mb-4 flex items-center gap-4">
                    <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 shadow-sm">
                      <FileAudio size={32} />
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="truncate text-xl font-bold text-sky-900">
                        {fileName || 'Przesłany plik'}
                      </h3>
                      <p className="text-sm font-medium text-sky-700 opacity-80">Analiza lokalna</p>
                    </div>
                  </div>
                  <h3 className="flex items-center gap-2 text-sm font-bold tracking-wide text-sky-600 uppercase">
                    <Music size={16} /> Raport emocjonalny
                  </h3>
                </div>
                <CardContent className="p-8">
                  <div className="mb-2 flex w-full flex-col items-center">
                    <span className="mb-6 inline-block rounded-full bg-sky-100 px-4 py-1.5 text-sm font-bold tracking-widest text-sky-700 uppercase shadow-sm">
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
                <Upload size={48} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-500">Oczekiwanie na plik</h3>
              <p className="max-w-[250px] text-sm">
                Wybierz plik z lewej strony, aby zobaczyć szczegółowy wykres emocji tutaj.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
