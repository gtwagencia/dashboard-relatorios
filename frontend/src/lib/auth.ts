import { authApi } from './api';
import { Client } from '@/types';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Token getters/setters
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearRefreshToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Decode JWT payload without verification (client-side only)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Pad base64 string
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Get current user from token
export function getUser(): Client | null {
  const token = getToken();
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  return {
    id: payload.sub as string,
    name: payload.name as string,
    email: payload.email as string,
    role: payload.role as string,
    isActive: true,
  };
}

// Check if user is authenticated (token exists and not expired)
export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;

  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  const exp = payload.exp as number;
  if (!exp) return false;

  // Check if token is expired (with 30 second buffer)
  return Date.now() < (exp * 1000) - 30000;
}

// Login: call API, store tokens, return user
export async function login(email: string, password: string): Promise<Client> {
  const response = await authApi.login(email, password);
  const { accessToken, refreshToken, user } = response.data;

  setToken(accessToken);
  setRefreshToken(refreshToken);

  return user;
}

// Logout: call API logout, clear tokens, redirect
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();

  try {
    if (refreshToken) {
      await authApi.logout(refreshToken);
    }
  } catch {
    // Ignore errors on logout
  } finally {
    clearToken();
    clearRefreshToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}
