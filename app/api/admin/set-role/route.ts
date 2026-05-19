import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { checkOrigin } from "@/lib/csrf";
import { logAdmin, getRequestMeta } from "@/lib/audit-log";

const VALID_ROLES = ['admin', 'teacher', 'student', 'parent'] as const;
type ValidRole = typeof VALID_ROLES[number];

export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    try {
        const { uid, role } = await request.json();

        if (!uid || typeof uid !== 'string') {
            return NextResponse.json({ error: 'uid шаардлагатай' }, { status: 400 });
        }
        if (!VALID_ROLES.includes(role as ValidRole)) {
            return NextResponse.json({ error: `role нь ${VALID_ROLES.join(', ')}-ийн нэг байх ёстой` }, { status: 400 });
        }

        // Verify the requester has admin privileges
        const authorization = request.headers.get("Authorization");
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

        // FIX 32: Look up the prior role before mutating so the audit entry can record it.
        let oldRole: string | undefined;
        try {
            const targetUser = await adminAuth.getUser(uid);
            oldRole = (targetUser.customClaims?.role as string | undefined) || undefined;
        } catch {
            // Non-fatal — proceed with the role change even if the lookup failed.
        }

        await adminAuth.setCustomUserClaims(uid, { role });

        // FIX 32 / FIX 33: Record the role change with caller IP/UA for audit trail.
        const meta = getRequestMeta(request);
        await logAdmin({
            action: 'set_role',
            actorUid: decodedToken.uid,
            actorRole: decodedToken.role as string | undefined,
            targetUid: uid,
            metadata: { oldRole: oldRole || null, newRole: role },
            ...meta,
        });

        return NextResponse.json({ message: `Role ${role} assigned to ${uid}` });
    } catch (error: any) {
        console.error("Error setting role:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
