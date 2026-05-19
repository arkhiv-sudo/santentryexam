// CSRF protection — verify request origin matches allowed origins
import { NextRequest, NextResponse } from "next/server";

export function getAllowedOrigins(): string[] {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  const list = [env, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean);
  return list;
}

export function checkOrigin(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const allowed = getAllowedOrigins();

  // If neither header is present (some bots / curl) reject
  if (!origin && !referer) {
    return { ok: false, response: NextResponse.json({ error: 'Origin шаардлагатай' }, { status: 403 }) };
  }
  const isAllowed = (val: string | null) => !!val && allowed.some(a => val.startsWith(a));
  if (origin && !isAllowed(origin)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden origin' }, { status: 403 }) };
  }
  if (!origin && referer && !isAllowed(referer)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden referer' }, { status: 403 }) };
  }
  return { ok: true };
}
