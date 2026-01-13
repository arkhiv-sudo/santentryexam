import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(request: NextRequest) {
    try {
        const session = request.cookies.get('__session')?.value;
        const role = request.cookies.get('role')?.value;
        const { pathname } = request.nextUrl;

        // Bypass for internal Next.js paths and static assets
        if (
            pathname.startsWith('/_next') ||
            pathname.startsWith('/api') ||
            pathname.includes('.') ||
            pathname === '/favicon.ico'
        ) {
            return NextResponse.next();
        }

        // 1. If trying to access dashboard but no session, redirect to login
        const dashboardPaths = ['/admin', '/teacher', '/student', '/parent'];
        const isDashboardPath = dashboardPaths.some(path => pathname.startsWith(path));

        if (!session && isDashboardPath) {
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = '/login';
            return NextResponse.redirect(loginUrl);
        }

        // 2. If logged in and trying to access auth pages, redirect to dashboard
        if (session && role && (pathname === '/login' || pathname === '/signup')) {
            if (request.nextUrl.searchParams.has('expired')) {
                return NextResponse.next();
            }
            const dashboardUrl = request.nextUrl.clone();
            dashboardUrl.pathname = `/${role}`;
            // Special case for student if needed, but role mapping should match path
            return NextResponse.redirect(dashboardUrl);
        }

        // 2.5. If logged in and accessing root path, redirect to role-specific dashboard
        if (session && pathname === '/') {
            const rootUrl = request.nextUrl.clone();
            rootUrl.pathname = role ? `/${role}` : '/login';
            return NextResponse.redirect(rootUrl);
        }

        // 3. Role-based protection
        if (pathname.startsWith('/admin') && role !== 'admin') {
            const homeUrl = request.nextUrl.clone();
            homeUrl.pathname = '/';
            return NextResponse.redirect(homeUrl);
        }

        if (pathname.startsWith('/teacher') && role !== 'teacher' && role !== 'admin') {
            const homeUrl = request.nextUrl.clone();
            homeUrl.pathname = '/';
            return NextResponse.redirect(homeUrl);
        }

        if (pathname.startsWith('/parent') && role !== 'parent' && role !== 'admin') {
            const homeUrl = request.nextUrl.clone();
            homeUrl.pathname = '/';
            return NextResponse.redirect(homeUrl);
        }

        return NextResponse.next();
    } catch (error) {
        console.error('Middleware execution failed:', error);
        // Fallback to avoid 500 error
        return NextResponse.next();
    }
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
