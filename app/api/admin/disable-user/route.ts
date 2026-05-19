import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { logAdmin, getRequestMeta } from "@/lib/audit-log";

/**
 * POST /api/admin/disable-user
 *
 * B5: Mirror an admin archive/unarchive into Firebase Auth so a disabled
 * account cannot obtain a fresh ID token after Firestore is updated.
 *
 * Body: { uid: string; disabled: boolean }
 * Requires the caller to be an authenticated admin (session cookie).
 */
export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { uid?: string; disabled?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { uid, disabled } = body;
    if (!uid) {
        return NextResponse.json({ error: "uid required" }, { status: 400 });
    }

    // Self-disable guard — keeps an admin from locking themselves out.
    if (uid === user.uid && disabled) {
        return NextResponse.json({ error: "Cannot disable your own account" }, { status: 400 });
    }

    try {
        await adminAuth.updateUser(uid, { disabled: !!disabled });
        if (disabled) {
            // Immediately invalidate all active sessions for the disabled user
            await adminAuth.revokeRefreshTokens(uid);
        }

        // FIX 32 / FIX 33: Record disable/enable action with caller IP/UA.
        const meta = getRequestMeta(request);
        await logAdmin({
            action: 'disable_user',
            actorUid: user.uid,
            actorRole: user.role,
            targetUid: uid,
            metadata: { disabled: !!disabled },
            ...meta,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Failed to update auth user:", err);
        return NextResponse.json({ error: "Failed to update auth user" }, { status: 500 });
    }
}
