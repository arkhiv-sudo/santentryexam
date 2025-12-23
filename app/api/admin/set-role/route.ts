import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
    try {
        const { uid, role } = await req.json();

        // Verify the requester has admin privileges
        const authorization = req.headers.get("Authorization");
        if (!authorization?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authorization.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        if (decodedToken.role !== "admin") {
            // Allow if it's a "super admin" secret call? For now, strictly check admin claim.
            // Problem: Bootstrap problem. First admin needs to be set manually or securely.
            return NextResponse.json({ error: "Forbidden: Admins only" }, { status: 403 });
        }

        await adminAuth.setCustomUserClaims(uid, { role });

        return NextResponse.json({ message: `Role ${role} assigned to ${uid}` });
    } catch (error: any) {
        console.error("Error setting role:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
