import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

/**
 * GET /api/exam/[examId]/questions
 *
 * Returns the exam's questions WITHOUT correctAnswer / solution fields.
 * Requires:
 *   - Valid session cookie (authenticated user)
 *   - User must be registered for the exam
 *   - Exam must be published and the current time must be within the exam window
 *     (scheduledAt <= now <= scheduledAt + duration)
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ examId: string }> }
) {
    const { examId } = await params;

    // 1. Authenticate via session cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("__session")?.value;
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

    // 2. Fetch exam
    const examDoc = await adminDb.collection("exams").doc(examId).get();
    if (!examDoc.exists) {
        return NextResponse.json({ error: "Шалгалт олдсонгүй" }, { status: 404 });
    }
    const exam = examDoc.data()!;

    // 3. Check exam is published
    if (exam.status !== "published") {
        return NextResponse.json({ error: "Шалгалт нийтлэгдээгүй байна" }, { status: 403 });
    }

    // 4. Check time window: scheduledAt <= now <= scheduledAt + duration
    const now = Date.now();
    const scheduledAt: number = exam.scheduledAt?.toMillis?.() ?? new Date(exam.scheduledAt).getTime();
    const durationMs: number = (exam.duration || 60) * 60 * 1000;
    const examEnd = scheduledAt + durationMs;

    if (now < scheduledAt) {
        return NextResponse.json({ error: "Шалгалт эхлээгүй байна" }, { status: 403 });
    }
    if (now > examEnd) {
        return NextResponse.json({ error: "Шалгалтын хугацаа дууссан" }, { status: 403 });
    }

    // 5. Check student is registered
    const regQuery = await adminDb
        .collection("registrations")
        .where("studentId", "==", uid)
        .where("examId", "==", examId)
        .get();

    if (regQuery.empty) {
        return NextResponse.json({ error: "Шалгалтанд бүртгэлгүй байна" }, { status: 403 });
    }

    const reg = regQuery.docs[0].data();
    if (reg.status === "completed") {
        return NextResponse.json({ error: "Та энэ шалгалтыг аль хэдийн өгсөн байна" }, { status: 403 });
    }

    // FIX 27: Block the questions fetch entirely once the student has crossed the
    // violation threshold. The submit route already rejects in this case, but we
    // also want to stop them re-loading the questions list.
    const MAX_VIOLATIONS = 3;
    if ((reg.violations || 0) >= MAX_VIOLATIONS) {
        return NextResponse.json({
            error: 'Дүрэм зөрчсөний улмаас шалгалт хаагдсан байна',
            violationLockout: true,
        }, { status: 403 });
    }

    // FIX 9: Double-check via submissions collection to handle TOCTOU race conditions.
    // The registration status may not yet be "completed" if the student is mid-submit,
    // but a submission document already exists — block them in that case too.
    const subSnap = await adminDb.collection("submissions")
        .where("studentId", "==", uid)
        .where("examId", "==", examId)
        .limit(1)
        .get();
    if (!subSnap.empty) {
        return NextResponse.json({ error: "Шалгалтыг аль хэдийн өгсөн байна" }, { status: 403 });
    }

    // FIX 25: Late entry window is min(10 minutes, 20% of duration) so very short
    // exams don't grant a window longer than the exam itself.
    const lateEntryWindowMs = Math.min(10 * 60 * 1000, (exam.duration || 60) * 60 * 1000 * 0.2);
    const entryDeadline = scheduledAt + lateEntryWindowMs;
    if (reg.status !== "started" && now > entryDeadline) {
        return NextResponse.json({ error: `Шалгалт эхэлсэнээс хойш ${Math.floor(lateEntryWindowMs / 60000)} минут өнгөрсөн тул орох боломжгүй` }, { status: 403 });
    }

    // 6. Fetch questions (from embedded snapshot or fallback to Firestore)
    const questionIds: string[] = exam.questionIds || [];
    if (questionIds.length === 0) {
        return NextResponse.json({ error: "Шалгалтанд асуулт оноогдоогүй байна. Дахин оролдоно уу." }, { status: 503 });
    }

    let questions = [];
    
    // ✅ OPTIMIZATION: Use embedded snapshot (0 extra reads per student).
    // FIX 9 / FIX 19: Strip correctAnswer, solution, and solutionMediaUrl from snapshot
    // before sending to the client so answer data never leaks to the browser.
    if (exam.questionSnapshot && exam.questionSnapshot.length > 0) {
        questions = exam.questionSnapshot.map(({ correctAnswer, solution, solutionMediaUrl, ...safe }: { correctAnswer?: unknown; solution?: unknown; solutionMediaUrl?: unknown; [key: string]: unknown }) => safe);
    } else {
        // Legacy fallback: fetch dynamically using single batched RPC
        const docRefs = questionIds.map(id => adminDb.collection("questions").doc(id));
        const questionDocs = await adminDb.getAll(...docRefs);

        questions = questionDocs
            .filter(d => d.exists)
            .map(d => {
                const data = d.data()!;
                // NEVER send correctAnswer or solution to the client
                return {
                    id: d.id,
                    type: data.type,
                    content: data.content,
                    options: data.options ?? null,
                    optionImages: data.optionImages ?? null,
                    mediaUrl: data.mediaUrl ?? null,
                    mediaType: data.mediaType ?? null,
                    extraImageUrls: data.extraImageUrls ?? null,
                    points: data.points ?? 1,
                    subject: data.subject ?? null,
                };
            });
    }

    return NextResponse.json({
        examId,
        title: exam.title,
        duration: exam.duration,
        grade: exam.grade,
        scheduledAt: exam.scheduledAt?.toMillis?.() ?? scheduledAt,
        passingScore: exam.passingScore ?? 0,
        questions,
        registrationId: regQuery.docs[0].id,
        registrationStatus: reg.status,
    });
}
