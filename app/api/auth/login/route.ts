import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { idToken } = await req.json();

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

        // Also set a visible 'role' cookie for client-side/middleware redirection convenience
        // (This is not used for security, only for routing)
        const role = decodedToken.role || 'student';
        (await cookies()).set("role", role, {
            maxAge: expiresIn,
            path: "/",
        });

        return NextResponse.json({ status: "success", role });
    } catch (error: any) {
        console.error("Session creation error:", error);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
}
