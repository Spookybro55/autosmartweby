'use client';

import { useState, useEffect } from 'react';

interface SessionUser {
  email: string;
  provider: 'google' | 'password';
  name: string;
}

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ user: null, loading: true });

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) return null;
        return res.json();
      })
      .then(data => {
        if (data?.authenticated) {
          setState({
            user: { email: data.email, provider: data.provider, name: data.name },
            loading: false,
          });
        } else {
          setState({ user: null, loading: false });
        }
      })
      .catch(() => {
        setState({ user: null, loading: false });
      });
  }, []);

  return state;
}
