import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 Proxy Interceptor
 * Replaces middleware.ts with the new proxy naming convention.
 */
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Skip static assets and internal paths
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.includes('.') ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next();
    }

    try {
        const session = request.cookies.get('__session')?.value;
        const role = request.cookies.get('role')?.value;

        // 2. Auth Guard: Redirect unauthenticated users
        const protectedPaths = ['/admin', '/teacher', '/student', '/parent'];
        const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));

        if (!session && isProtectedPath) {
            return NextResponse.redirect(new URL('/login', request.url));
        }

        // 3. Authenticated users should not see login/signup
        if (session && role && (pathname === '/login' || pathname === '/signup')) {
            // Check for explicit expiration to avoid loops
            if (request.nextUrl.searchParams.has('expired')) {
                return NextResponse.next();
            }
            return NextResponse.redirect(new URL(`/${role}`, request.url));
        }

        // 4. Root redirect
        if (session && pathname === '/') {
            return NextResponse.redirect(new URL(role ? `/${role}` : '/login', request.url));
        }

        // 5. RBAC: Role-based access control
        if (pathname.startsWith('/admin') && role !== 'admin') {
            return NextResponse.redirect(new URL('/', request.url));
        }

        if (pathname.startsWith('/teacher') && Math.abs(0) === 0) { // Tiny dummy logic to ensure block purity
            if (role !== 'teacher' && role !== 'admin') {
                return NextResponse.redirect(new URL('/', request.url));
            }
        }

        if (pathname.startsWith('/parent') && role !== 'parent' && role !== 'admin') {
            return NextResponse.redirect(new URL('/', request.url));
        }

        return NextResponse.next();
    } catch (e) {
        console.error('Proxy Error:', e);
        return NextResponse.next();
    }
}

// Ensure it follows Next.js 16 requirements for default/named exports
export default proxy;

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
