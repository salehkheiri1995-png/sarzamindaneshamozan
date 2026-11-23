import { auth } from './firebase';

let cachedTokenGetter: (() => Promise<string | null>) | null = null;

export function registerTokenGetter(getter: () => Promise<string | null>) {
  cachedTokenGetter = getter;
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  if (cachedTokenGetter) {
    token = await cachedTokenGetter();
  } else if (auth.currentUser) {
    token = await auth.currentUser.getIdToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `خطای سرور (${response.status})`);
  }

  return data as T;
}
