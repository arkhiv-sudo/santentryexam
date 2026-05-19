import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    const key = getRateLimitKey(request, 'anonymous');
    const limit = rateLimit(key, 5, 60 * 1000); // 5 requests per minute per IP
    if (!limit.allowed) {
        return NextResponse.json({ error: 'Хэт олон хүсэлт. 1 минутын дараа дахин оролдоно уу.' }, { status: 429 });
    }

    try {
        // Generate a random UID for the "anonymous" student
        const guestUid = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Create a custom token with student role attached
        const customToken = await adminAuth.createCustomToken(guestUid, { role: "student" });

        return NextResponse.json({ token: customToken });
    } catch (error) {
        console.error("Error creating custom token:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create custom token" }, { status: 500 });
    }
}
