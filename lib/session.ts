import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { redirect } from "next/navigation";
import { UserRole } from "@/types";

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
