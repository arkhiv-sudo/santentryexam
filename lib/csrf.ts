// CSRF protection — verify request origin matches allowed origins
import { NextRequest, NextResponse } from "next/server";

/**
 * Origins we accept state-changing requests from.
 *
 * The request's own host is always included: a cross-site attacker's Origin
 * header carries THEIR domain, never ours, so "Origin === our own origin" is
 * exactly the check CSRF protection needs — and it means the app keeps working
 * on any deployment URL even when NEXT_PUBLIC_APP_URL is not configured.
 */
export function getAllowedOrigins(request?: NextRequest): string[] {
  const configured = [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL]
    .filter((v): v is string => !!v)
    .map(normalizeOrigin)
    .filter((v): v is string => !!v);

  const list = [...configured, 'http://localhost:3000', 'http://localhost:3001'];

  const host = request?.headers.get('x-forwarded-host') || request?.headers.get('host');
  if (host) {
    const proto = request?.headers.get('x-forwarded-proto')
      || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    list.push(`${proto}://${host}`);
  }

  return Array.from(new Set(list));
}

/** Reduce a URL (or bare origin) to its scheme://host[:port] form, or null. */
function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function checkOrigin(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const allowed = getAllowedOrigins(request);

  // If neither header is present (some bots / curl) reject
  if (!origin && !referer) {
    return { ok: false, response: NextResponse.json({ error: 'Origin шаардлагатай' }, { status: 403 }) };
  }

  // Exact origin match — a prefix match would let "https://ourdomain.mn.evil.com" through.
  const isAllowed = (value: string | null) => {
    const parsed = normalizeOrigin(value);
    return !!parsed && allowed.includes(parsed);
  };

  if (origin && !isAllowed(origin)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden origin' }, { status: 403 }) };
  }
  if (!origin && referer && !isAllowed(referer)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden referer' }, { status: 403 }) };
  }
  return { ok: true };
}
