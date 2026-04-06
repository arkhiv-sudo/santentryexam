import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST() {
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
