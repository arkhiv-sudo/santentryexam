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

    // 6. Fetch questions (from embedded snapshot or fallback to Firestore)
    const questionIds: string[] = exam.questionIds || [];
    if (questionIds.length === 0) {
        return NextResponse.json({ error: "Шалгалтанд асуулт оноогдоогүй байна. Дахин оролдоно уу." }, { status: 503 });
    }

    let questions = [];
    
    // ✅ OPTIMIZATION: Use embedded embedded snapshot (0 extra reads per student)
    if (exam.questionSnapshot && exam.questionSnapshot.length > 0) {
        questions = exam.questionSnapshot;
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
        questions,
        registrationId: regQuery.docs[0].id,
        registrationStatus: reg.status,
    });
}
