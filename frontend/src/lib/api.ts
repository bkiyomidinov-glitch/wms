import type { TokenResponse } from "@/types/api";

const ACCESS_KEY = "wms_access_token";
const REFRESH_KEY = "wms_refresh_token";

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code = "API_ERROR",
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  return {
    accessToken: localStorage.getItem(ACCESS_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
  };
}

export function setStoredTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearStoredTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

let refreshPromise: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refreshToken } = getStoredTokens();
    if (!refreshToken) return null;

    try {
      const res = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        clearStoredTokens();
        return null;
      }
      const data = (await res.json()) as TokenResponse;
      setStoredTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } catch {
      clearStoredTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retryOnAuth = true
): Promise<T> {
  const { accessToken } = getStoredTokens();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401 && retryOnAuth && !path.includes("/auth/login")) {
    const newAccess = await attemptRefresh();
    if (newAccess) {
      return apiRequest<T>(path, options, false);
    }
    clearStoredTokens();
    window.dispatchEvent(new Event("wms:unauthorized"));
  }

  if (!res.ok) {
    let message = `Ошибка запроса (${res.status})`;
    let code = "API_ERROR";
    let details: Record<string, unknown> = {};
    try {
      const errBody = await res.json();
      if (typeof errBody.message === "string") message = errBody.message;
      else if (typeof errBody.detail === "string") message = errBody.detail;
      else if (Array.isArray(errBody.detail) && errBody.detail[0]?.msg) {
        message = String(errBody.detail[0].msg);
      }
      if (typeof errBody.error === "string") code = errBody.error;
      if (errBody.details && typeof errBody.details === "object") details = errBody.details;
    } catch {
      // ignore non-JSON body
    }
    throw new ApiError(res.status, message, code, details);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
