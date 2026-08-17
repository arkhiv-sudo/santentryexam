import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { logAdmin, getRequestMeta } from "@/lib/audit-log";

/**
 * POST /api/admin/exams/[examId]/control
 * Body: { action: 'start' } | { action: 'nudge', studentId } | { action: 'admit', studentId }
 *
 *  start  — «Бүгдэд эхлүүлэх». Шалгалтын `startedAt`-ыг тавьж, БЭЛЭН болсон
 *           бүх сурагчийг нэг мөчид `started` төлөвт шилжүүлнэ. Цаг эндээс
 *           тоологдоно (сурагч бүрд ижил).
 *  nudge  — бэлэн болоогүй сурагчид сануулга (дэлгэц дүүрэн анхааруулга + дуу).
 *  admit  — эхэлсний дараа хоцорсон сурагчийг тусгайлан оруулах.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
    const origin = checkOrigin(req);
    if (!origin.ok) return origin.response;

    const admin = await getCurrentUser();
    if (!admin || admin.role !== "admin") {
        return NextResponse.json({ error: "Зөвхөн админ хийх боломжтой" }, { status: 403 });
    }

    const { examId } = await params;
    let body: { action?: string; studentId?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Буруу JSON" }, { status: 400 });
    }

    const examRef = adminDb.collection("exams").doc(examId);
    const examSnap = await examRef.get();
    if (!examSnap.exists) return NextResponse.json({ error: "Шалгалт олдсонгүй" }, { status: 404 });
    const exam = examSnap.data()!;

    const meta = getRequestMeta(req);

    // ── Бүгдэд эхлүүлэх ──────────────────────────────────────────────
    if (body.action === "start") {
        if (exam.startedAt) {
            return NextResponse.json({
                error: "Шалгалт аль хэдийн эхэлсэн байна",
                startedAt: exam.startedAt.toMillis?.() ?? null,
            }, { status: 400 });
        }
        if (exam.status !== "published") {
            return NextResponse.json({ error: "Эхлүүлэхийн өмнө шалгалтыг нийтлэх шаардлагатай" }, { status: 400 });
        }
        if (!exam.questionIds?.length) {
            return NextResponse.json({ error: "Шалгалтад асуулт оноогдоогүй байна" }, { status: 400 });
        }

        const now = Timestamp.now();
        const regs = await adminDb.collection("registrations").where("examId", "==", examId).get();
        const readyDocs = regs.docs.filter(d => d.data().status === "ready");

        const batch = adminDb.batch();
        batch.update(examRef, { startedAt: now, startedBy: admin.uid });
        readyDocs.forEach(d => batch.update(d.ref, { status: "started", startedAt: now }));
        await batch.commit();

        await logAdmin({
            action: "bulk_action",
            actorUid: admin.uid,
            actorRole: admin.role,
            targetResource: `exams/${examId}`,
            metadata: { change: "exam_started", ready: readyDocs.length, registered: regs.size },
            ...meta,
        });

        return NextResponse.json({
            success: true,
            startedAt: now.toMillis(),
            started: readyDocs.length,
            notReady: regs.size - readyDocs.length,
        });
    }

    // ── Сануулга илгээх ──────────────────────────────────────────────
    if (body.action === "nudge") {
        if (!body.studentId) return NextResponse.json({ error: "studentId шаардлагатай" }, { status: 400 });
        const regSnap = await adminDb.collection("registrations")
            .where("examId", "==", examId).where("studentId", "==", body.studentId).limit(1).get();
        if (regSnap.empty) return NextResponse.json({ error: "Бүртгэл олдсонгүй" }, { status: 404 });
        await regSnap.docs[0].ref.update({
            nudgedAt: Timestamp.now(),
            nudgeCount: FieldValue.increment(1),
        });
        return NextResponse.json({ success: true });
    }

    // ── Хоцорсон сурагчийг оруулах ───────────────────────────────────
    if (body.action === "admit") {
        if (!body.studentId) return NextResponse.json({ error: "studentId шаардлагатай" }, { status: 400 });
        if (!exam.startedAt) return NextResponse.json({ error: "Шалгалт хараахан эхлээгүй байна" }, { status: 400 });
        const regSnap = await adminDb.collection("registrations")
            .where("examId", "==", examId).where("studentId", "==", body.studentId).limit(1).get();
        if (regSnap.empty) return NextResponse.json({ error: "Бүртгэл олдсонгүй" }, { status: 404 });
        const reg = regSnap.docs[0];
        if (reg.data().status === "completed") {
            return NextResponse.json({ error: "Сурагч аль хэдийн илгээсэн байна" }, { status: 400 });
        }
        await reg.ref.update({ admittedLate: true, status: "started", startedAt: Timestamp.now() });

        await logAdmin({
            action: "bulk_action",
            actorUid: admin.uid,
            actorRole: admin.role,
            targetUid: body.studentId,
            targetResource: `exams/${examId}`,
            metadata: { change: "late_admission" },
            ...meta,
        });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "action нь start | nudge | admit байх ёстой" }, { status: 400 });
}
