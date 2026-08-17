import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { checkOrigin } from "@/lib/csrf";

/**
 * POST /api/exam/[examId]/register
 *
 * Server-side registration used by the phone+code entry flow (/s). Unlike the
 * client-side ExamService.registerForExam it is authoritative (Admin SDK) and
 * gates on the exam actually being open rather than on registrationEndDate —
 * a student who signs in while the exam is running must be able to enter it.
 *
 * Idempotent: returns the existing registration id when one is already there.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
    const origin = checkOrigin(req);
    if (!origin.ok) return origin.response;

    const { examId } = await params;

    const sessionCookie = (await cookies()).get("__session")?.value;
    if (!sessionCookie) {
        return NextResponse.json({ error: "Нэвтрээгүй байна" }, { status: 401 });
    }

    let uid: string;
    try {
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
        uid = decoded.uid;
    } catch {
        return NextResponse.json({ error: "Сессион хүчингүй" }, { status: 401 });
    }

    const examDoc = await adminDb.collection("exams").doc(examId).get();
    if (!examDoc.exists) {
        return NextResponse.json({ error: "Шалгалт олдсонгүй" }, { status: 404 });
    }
    const exam = examDoc.data()!;

    if (exam.status !== "published") {
        return NextResponse.json({ error: "Шалгалт нийтлэгдээгүй байна" }, { status: 403 });
    }

    // Огноогоор биш төлөвөөр: эхэлсэн бөгөөд хугацаа нь дууссан бол л хаана.
    const startedAt: number | null = exam.startedAt?.toMillis?.() ?? null;
    if (startedAt && Date.now() > startedAt + (exam.duration || 60) * 60 * 1000) {
        return NextResponse.json({ error: "Шалгалтын хугацаа дууссан" }, { status: 403 });
    }

    // Already registered?
    const existing = await adminDb.collection("registrations")
        .where("studentId", "==", uid)
        .where("examId", "==", examId)
        .limit(1)
        .get();

    if (!existing.empty) {
        return NextResponse.json({ registrationId: existing.docs[0].id, alreadyRegistered: true });
    }

    const ref = await adminDb.collection("registrations").add({
        studentId: uid,
        examId,
        status: "registered",
        registeredAt: Timestamp.now(),
        violations: 0,
    });

    return NextResponse.json({ registrationId: ref.id, alreadyRegistered: false });
}
