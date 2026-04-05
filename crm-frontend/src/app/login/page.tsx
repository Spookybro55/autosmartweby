'use client';

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn } from 'lucide-react';

// Google Identity Services types
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: { theme?: string; size?: string; text?: string; width?: number }
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

  // Legacy email+password login
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Přihlášení se nezdařilo');
      }

      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba přihlášení');
    } finally {
      setLoading(false);
    }
  }

  // Google auth callback
  const handleGoogleResponse = useCallback(async (response: { credential: string }) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? 'Přihlášení přes Google se nezdařilo');
      }

      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba Google přihlášení');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize Google Sign-In when GIS script loads
  useEffect(() => {
    if (!googleReady || !GOOGLE_CLIENT_ID) return;

    const btnEl = document.getElementById('google-signin-btn');
    if (!btnEl || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse,
    });

    window.google.accounts.id.renderButton(btnEl, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 352,
    });
  }, [googleReady, handleGoogleResponse]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      {/* Google Identity Services SDK */}
      {GOOGLE_CLIENT_ID && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGoogleReady(true)}
        />
      )}

      <Card className="w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Sales CRM</h1>
          <p className="text-sm text-slate-500 mt-1">Přihlaste se do systému</p>
        </div>

        {/* Google Sign-In button */}
        {GOOGLE_CLIENT_ID && (
          <div className="mb-6">
            <div id="google-signin-btn" className="flex justify-center" />
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400">nebo</span>
              </div>
            </div>
          </div>
        )}

        {/* Legacy email+password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vas@email.cz"
              required
              autoFocus={!GOOGLE_CLIENT_ID}
            />
          </div>
          <div>
            <Label htmlFor="password">Heslo</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Heslo"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              'Přihlašování...'
            ) : (
              <>
                <LogIn className="h-4 w-4 mr-2" />
                Přihlásit se heslem
              </>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}
