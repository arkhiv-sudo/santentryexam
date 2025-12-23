import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const session = request.cookies.get('__session')?.value;
    const role = request.cookies.get('role')?.value;

    const { pathname } = request.nextUrl;

    // 1. If trying to access dashboard but no session, redirect to login
    if (!session && (pathname.startsWith('/admin') || pathname.startsWith('/teacher') || pathname.startsWith('/student') || pathname.startsWith('/parent'))) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 2. If logged in and trying to access auth pages, redirect to dashboard
    if (session && (pathname === '/login' || pathname === '/signup')) {
        if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url));
        if (role === 'teacher') return NextResponse.redirect(new URL('/teacher', request.url));
        if (role === 'parent') return NextResponse.redirect(new URL('/parent', request.url));
        return NextResponse.redirect(new URL('/student', request.url));
    }

    // 2.5. If logged in and accessing root path, redirect to role-specific dashboard
    if (session && pathname === '/') {
        if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url));
        if (role === 'teacher') return NextResponse.redirect(new URL('/teacher', request.url));
        if (role === 'parent') return NextResponse.redirect(new URL('/parent', request.url));
        if (role === 'student') return NextResponse.redirect(new URL('/student', request.url));
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 3. Role-based protection
    if (pathname.startsWith('/admin') && role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url)); // Or unauthorized page
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
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
