import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    try {
        const { pathname } = request.nextUrl;
        const session = request.cookies.get('__session')?.value;
        const role = request.cookies.get('role')?.value;

        // 1. Protected paths check
        const isDashboard = pathname.startsWith('/admin') ||
            pathname.startsWith('/teacher') ||
            pathname.startsWith('/student') ||
            pathname.startsWith('/parent');

        if (isDashboard && !session) {
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = '/login';
            return NextResponse.redirect(loginUrl);
        }

        // 2. Authenticated user redirection from auth pages
        if (session && (pathname === '/login' || pathname === '/signup')) {
            const destUrl = request.nextUrl.clone();
            destUrl.pathname = role ? `/${role}` : '/';
            return NextResponse.redirect(destUrl);
        }

        // 3. Simple Role Based Access check
        if (pathname.startsWith('/admin') && role !== 'admin') {
            return NextResponse.redirect(new URL('/', request.url));
        }

        return NextResponse.next();
    } catch (error) {
        console.error('Proxy Error:', error);
        return NextResponse.next();
    }
}

export const config = {
    matcher: [
        '/admin/:path*',
        '/teacher/:path*',
        '/student/:path*',
        '/parent/:path*',
        '/login',
        '/signup',
        '/'
    ],
};
