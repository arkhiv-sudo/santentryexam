import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { safeApiError } from "@/lib/utils";
import { checkOrigin } from "@/lib/csrf";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    const key = getRateLimitKey(request, 'login');
    const limit = rateLimit(key, 10, 60 * 1000); // 10 login attempts per minute per IP
    if (!limit.allowed) {
        return NextResponse.json({ error: 'Хэт олон оролдлого. 1 минутын дараа дахин оролдоно уу.' }, { status: 429 });
    }

    try {
        const { idToken } = await request.json();

        if (!idToken) {
            return NextResponse.json({ error: "Missing ID token" }, { status: 400 });
        }

        // Verify the ID token first
        const decodedToken = await adminAuth.verifyIdToken(idToken);

        // Create session cookie (5 days)
        const expiresIn = 60 * 60 * 24 * 5 * 1000;
        const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

        // Set cookie
        (await cookies()).set("__session", sessionCookie, {
            maxAge: expiresIn,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            sameSite: "lax",
        });

        // Role cookie — used by middleware (request.cookies access works with httpOnly)
        const role = decodedToken.role || 'student';
        (await cookies()).set("role", role, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 5, // 5 days like session
        });

        return NextResponse.json({ status: "success", role });
    } catch (error: unknown) {
        console.error("Session creation error:", error);
        return NextResponse.json({ error: safeApiError(error, "Unauthorized") }, { status: 401 });
    }
}
