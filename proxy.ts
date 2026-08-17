import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Системд одоо байгаа эрхүүд. Хуучин 'parent' энд байхгүй тул тийм cookie-тэй
 *  хэрэглэгчийг «эрхгүй» гэж үзэж, cookie-г нь цэвэрлэнэ. */
const VALID_ROLES = ['admin', 'teacher', 'student'];

/** Хуучирсан/хүчингүй session-ий cookie-г устгаад хүссэн хуудас руу нь оруулна. */
function clearSession(request: NextRequest, redirectTo?: string) {
    const response = redirectTo
        ? NextResponse.redirect(new URL(redirectTo, request.url))
        : NextResponse.next();
    response.cookies.delete('__session');
    response.cookies.delete('role');
    return response;
}

export default function proxy(request: NextRequest) {
    try {
        const { pathname } = request.nextUrl;
        const session = request.cookies.get('__session')?.value;
        const role = request.cookies.get('role')?.value;
        const hasValidRole = !!role && VALID_ROLES.includes(role);

        // 1. Protected paths check
        const isDashboard = pathname.startsWith('/admin') ||
            pathname.startsWith('/teacher') ||
            pathname.startsWith('/student');

        if (isDashboard && !session) {
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = '/login';
            return NextResponse.redirect(loginUrl);
        }

        // 2. Session-тэй мөртлөө эрх нь хүчингүй (жишээ нь устгасан 'parent'
        //    эсвэл устсан бүртгэлийн үлдэгдэл) бол cookie-г цэвэрлэж, /login-д
        //    үлдээнэ. Үгүй бол хэрэглэгч байхгүй хуудас руу түлхэгдэж 404 авна.
        if (session && !hasValidRole) {
            return clearSession(request, pathname === '/login' ? undefined : '/login');
        }

        // 3. Auth pages redirection for logged-in users
        if (session && hasValidRole && pathname === '/login') {
            const destUrl = request.nextUrl.clone();
            destUrl.pathname = `/${role}`;
            return NextResponse.redirect(destUrl);
        }

        // 4. RBAC — redirect to home if the user's role doesn't match the path.
        // FIX 8: Guards /admin, /teacher, /student.
        if (pathname.startsWith('/admin') && role !== 'admin') {
            return NextResponse.redirect(new URL('/', request.url));
        }
        if (pathname.startsWith('/teacher') && role !== 'teacher' && role !== 'admin') {
            return NextResponse.redirect(new URL('/', request.url));
        }
        if (pathname.startsWith('/student') && role !== 'student' && role !== 'admin') {
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
        '/login',
        '/'
    ],
};
