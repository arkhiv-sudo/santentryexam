import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { logAdmin, getRequestMeta } from "@/lib/audit-log";
import { generateExamCode } from "@/lib/utils-server";

/**
 * POST /api/admin/students/regenerate-code
 * Body: { uid: string }
 *
 * Issues a new exam login code for one student. The previous code stops
 * working immediately, and any failed-attempt lockout on that phone is cleared.
 */
export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    const admin = await getCurrentUser();
    if (!admin || admin.role !== "admin") {
        return NextResponse.json({ error: "Зөвхөн админ хийх боломжтой" }, { status: 403 });
    }

    let uid: string | undefined;
    try {
        ({ uid } = await request.json());
    } catch {
        return NextResponse.json({ error: "Буруу JSON" }, { status: 400 });
    }
    if (!uid || typeof uid !== 'string') {
        return NextResponse.json({ error: "uid шаардлагатай" }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
        return NextResponse.json({ error: "Сурагч олдсонгүй" }, { status: 404 });
    }
    if (snap.data()?.role !== 'student') {
        return NextResponse.json({ error: "Зөвхөн сурагчид нэвтрэх код олгоно" }, { status: 400 });
    }

    const examCode = generateExamCode();
    await userRef.set({ examCode, codeUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // Clear any brute-force lockout so the student can log in with the new code
    const phone = snap.data()?.phone as string | undefined;
    if (phone) {
        await adminDb.collection("exam_login_attempts").doc(phone).delete().catch(() => {});
    }

    const meta = getRequestMeta(request);
    await logAdmin({
        action: 'exam_code_regenerate',
        actorUid: admin.uid,
        actorRole: admin.role,
        targetUid: uid,
        ...meta,
    });

    return NextResponse.json({ success: true, examCode });
}
