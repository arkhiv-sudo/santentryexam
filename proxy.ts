import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Bypass static and internal paths
    if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.') || pathname === '/favicon.ico') {
        return NextResponse.next();
    }

    const session = request.cookies.get('__session')?.value;
    const role = request.cookies.get('role')?.value;

    // 2. Protected paths check
    const protectedPaths = ['/admin', '/teacher', '/student', '/parent'];
    const isProtected = protectedPaths.some(p => pathname.startsWith(p));

    if (isProtected && !session) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 3. Authenticated user redirect from auth pages
    if (session && role && (pathname === '/login' || pathname === '/signup')) {
        return NextResponse.redirect(new URL(`/${role}`, request.url));
    }

    // 4. Role Based Access
    if (pathname.startsWith('/admin') && role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url));
    }

    if (pathname.startsWith('/teacher') && role !== 'teacher' && role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url));
    }

    if (pathname.startsWith('/parent') && role !== 'parent' && role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
