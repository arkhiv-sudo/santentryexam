import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { redirect } from "next/navigation";
import { UserRole } from "@/types";

// FIX 37: TODO — Build /account/sessions page that calls adminAuth.listSessionCookies(uid)
// and allows users to revoke individual sessions. Currently users can only logout
// (revokes their own active cookie) or admin must call disable-user to nuke them all.

export async function getCurrentUser() {
    const session = (await cookies()).get("__session")?.value;

    if (!session) {
        return null;
    }

    try {
        const decodedClaims = await adminAuth.verifySessionCookie(session, true);
        return {
            uid: decodedClaims.uid,
            email: decodedClaims.email,
            role: (decodedClaims.role || 'student') as UserRole,
            // Add other claims if needed
        };
    } catch (error: any) {
        if (error.code === 'auth/session-cookie-expired') {
            console.log("Session expired - redirecting to login");
        } else {
            console.error("Session verification failed", error);
        }
        return null;
    }
}

export async function requireRole(allowedRoles: UserRole[]) {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login?expired=1");
    }

    if (!allowedRoles.includes(user.role)) {
        console.warn(`Unauthorized access attempt by ${user.email} (Role: ${user.role}) for required roles: ${allowedRoles.join(", ")}`);
        // Redirect to their allowed dashboard or home
        if (user.role === 'admin') redirect('/admin');
        if (user.role === 'teacher') redirect('/teacher');
        if (user.role === 'parent') redirect('/parent');
        redirect('/student');
    }

    return user;
}

// FIX 11: Check if the session is "fresh" (created within last N minutes)
// Used for sensitive admin actions. Opt-in — not applied to all routes.
export async function requireFreshAuth(maxAgeMinutes = 30): Promise<{ ok: true } | { ok: false; reason: string }> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, reason: 'Not authenticated' };

    // session cookie info — verifySessionCookie returns { auth_time, iat, exp }
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;
    if (!session) return { ok: false, reason: 'No session' };

    try {
        const decoded = await adminAuth.verifySessionCookie(session, true);
        const authTime = decoded.auth_time as number; // in seconds
        const ageMin = (Date.now() / 1000 - authTime) / 60;
        if (ageMin > maxAgeMinutes) {
            return { ok: false, reason: `Дахин нэвтэрсэн нь ${maxAgeMinutes} минутаас давсан` };
        }
        return { ok: true };
    } catch {
        return { ok: false, reason: 'Invalid session' };
    }
}
