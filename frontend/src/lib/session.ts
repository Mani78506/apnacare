export const SHARED_TOKEN_KEY = "apnacare_token";
export const SHARED_USER_KEY = "apnacare_user";
export const ADMIN_TOKEN_KEY = "apnacare_admin_token";
export const ADMIN_USER_KEY = "apnacare_admin_user";
export const CAREGIVER_TOKEN_KEY = "apnacare_caregiver_token";
export const CAREGIVER_USER_KEY = "apnacare_caregiver_user";

export type SharedRole = "admin" | "user";

export interface SharedSessionUser {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
}

export interface CaregiverSessionUser {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
  caregiver_id?: number | null;
  caregiver_status?: "pending" | "approved" | "rejected" | null;
  caregiver_verified?: boolean | null;
}

function decodeTokenPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getRoleFromToken(tokenKey: string): string | null {
  const payload = decodeTokenPayload(localStorage.getItem(tokenKey));
  return typeof payload?.role === "string" ? payload.role : null;
}

export function getStoredSharedUser(): SharedSessionUser | null {
  const rawUser = localStorage.getItem(SHARED_USER_KEY);
  const tokenRole = getRoleFromToken(SHARED_TOKEN_KEY);
  if (!rawUser) {
    return tokenRole ? { role: tokenRole } : null;
  }

  try {
    const parsed = JSON.parse(rawUser) as SharedSessionUser;
    if (parsed.role) return parsed;
    return tokenRole ? { ...parsed, role: tokenRole } : parsed;
  } catch {
    clearSharedSession();
    return null;
  }
}

export function getStoredSharedRole(): SharedRole | null {
  const role = getStoredSharedUser()?.role ?? getRoleFromToken(SHARED_TOKEN_KEY);
  return role === "admin" || role === "user" ? role : null;
}

export function getStoredAdminUser(): SharedSessionUser | null {
  const rawUser = localStorage.getItem(ADMIN_USER_KEY);
  const tokenRole = getRoleFromToken(ADMIN_TOKEN_KEY);
  if (!rawUser) {
    return tokenRole === "admin" ? { role: tokenRole } : null;
  }

  try {
    const parsed = JSON.parse(rawUser) as SharedSessionUser;
    if (parsed.role) return parsed;
    return tokenRole ? { ...parsed, role: tokenRole } : parsed;
  } catch {
    clearAdminSession();
    return null;
  }
}

export function getStoredCaregiverUser(): CaregiverSessionUser | null {
  const rawUser = localStorage.getItem(CAREGIVER_USER_KEY);
  const tokenRole = getRoleFromToken(CAREGIVER_TOKEN_KEY);

  if (!rawUser) {
    return tokenRole === "caregiver" ? { role: tokenRole } : null;
  }

  try {
    const parsed = JSON.parse(rawUser) as CaregiverSessionUser;
    if (parsed.role) return parsed;
    return tokenRole ? { ...parsed, role: tokenRole } : parsed;
  } catch {
    clearCaregiverSession();
    return null;
  }
}

export function clearSharedSession() {
  localStorage.removeItem(SHARED_TOKEN_KEY);
  localStorage.removeItem(SHARED_USER_KEY);
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}

export function clearCaregiverSession() {
  localStorage.removeItem(CAREGIVER_TOKEN_KEY);
  localStorage.removeItem(CAREGIVER_USER_KEY);
}
