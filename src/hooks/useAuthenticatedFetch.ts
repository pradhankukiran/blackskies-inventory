import { useAuth } from '@clerk/react';
import { useCallback } from 'react';

export type AuthenticatedFetch = typeof fetch;

export function useAuthenticatedFetch(): AuthenticatedFetch {
  const { getToken } = useAuth();

  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getToken();
      const headers = new Headers(init?.headers);

      if (token) headers.set('Authorization', `Bearer ${token}`);

      return fetch(input, { ...init, headers });
    },
    [getToken]
  );
}
