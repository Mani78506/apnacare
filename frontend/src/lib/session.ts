export const SHARED_TOKEN_KEY = "apnacare_token";
export const SHARED_USER_KEY = "apnacare_user";
export const ADMIN_TOKEN_KEY = "apnacare_admin_token";
export const ADMIN_USER_KEY = "apnacare_admin_user";
export const CAREGIVER_TOKEN_KEY = "apnacare_caregiver_token";
export const CAREGIVER_USER_KEY = "apnacare_caregiver_user";
export const LAST_ACTIVE_PORTAL_KEY = "apnacare_last_active_portal";

export type SharedRole = "admin" | "user";
export type PortalRole = "admin" | "user" | "caregiver";

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

function hasWindow() {
  return typeof window !== "undefined";
}

export function readSessionValue(key: string): string | null {
  if (!hasWindow()) return null;

  const sessionValue = window.sessionStorage.getItem(key);
  if (sessionValue !== null) {
    return sessionValue;
  }

  const legacyValue = window.localStorage.getItem(key);
  if (legacyValue !== null) {
    window.sessionStorage.setItem(key, legacyValue);
    window.localStorage.removeItem(key);
  }
  return legacyValue;
}

export function setSessionValue(key: string, value: string) {
  if (!hasWindow()) return;
  window.sessionStorage.setItem(key, value);
  window.localStorage.removeItem(key);
}

export function removeSessionValue(key: string) {
  if (!hasWindow()) return;
  window.sessionStorage.removeItem(key);
  window.localStorage.removeItem(key);
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
  const payload = decodeTokenPayload(readSessionValue(tokenKey));
  return typeof payload?.role === "string" ? payload.role : null;
}

function getActivePortalRoles(): PortalRole[] {
  const roles: PortalRole[] = [];

  if (getStoredSharedRole() === "user") {
    roles.push("user");
  }

  if (getStoredAdminUser()?.role === "admin") {
    roles.push("admin");
  }

  if (getStoredCaregiverUser()?.role === "caregiver") {
    roles.push("caregiver");
  }

  return roles;
}

export function getStoredSharedUser(): SharedSessionUser | null {
  const rawUser = readSessionValue(SHARED_USER_KEY);
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
  const rawUser = readSessionValue(ADMIN_USER_KEY);
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
  const rawUser = readSessionValue(CAREGIVER_USER_KEY);
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

export function setLastActivePortal(role: PortalRole) {
  setSessionValue(LAST_ACTIVE_PORTAL_KEY, role);
}

export function getLastActivePortal(): PortalRole | null {
  const role = readSessionValue(LAST_ACTIVE_PORTAL_KEY);
  return role === "admin" || role === "user" || role === "caregiver" ? role : null;
}

export function getPreferredPortalRole(): PortalRole | null {
  const activeRoles = getActivePortalRoles();
  if (activeRoles.length === 0) return null;

  const lastActiveRole = getLastActivePortal();
  if (lastActiveRole && activeRoles.includes(lastActiveRole)) {
    return lastActiveRole;
  }

  return activeRoles[0];
}

export function getPortalSessionRoles(): PortalRole[] {
  return getActivePortalRoles();
}

function clearLastActivePortalIf(role: PortalRole) {
  if (getLastActivePortal() === role) {
    removeSessionValue(LAST_ACTIVE_PORTAL_KEY);
  }
}

export function clearSharedSession() {
  clearLastActivePortalIf("user");
  removeSessionValue(SHARED_TOKEN_KEY);
  removeSessionValue(SHARED_USER_KEY);
}

export function clearAdminSession() {
  clearLastActivePortalIf("admin");
  removeSessionValue(ADMIN_TOKEN_KEY);
  removeSessionValue(ADMIN_USER_KEY);
}

export function clearCaregiverSession() {
  clearLastActivePortalIf("caregiver");
  removeSessionValue(CAREGIVER_TOKEN_KEY);
  removeSessionValue(CAREGIVER_USER_KEY);
}
