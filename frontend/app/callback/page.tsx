'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeToken } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  useEffect(() => {
    if (code) {
      exchangeToken(code)
        .then((tokenInfo) => {
          localStorage.setItem('spotify_token', tokenInfo.access_token);

          const redirectPath = localStorage.getItem('auth_redirect') || '/account';
          localStorage.removeItem('auth_redirect');

          router.push(redirectPath);
        })
        .catch((err) => {
          console.error('Error in token exchange:', err);
          router.push('/account?error=auth_failed');
        });
    }
  }, [code, router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
      <p className="text-sm font-medium text-slate-500">Łączenie z kontem Spotify...</p>
    </div>
  );
}
