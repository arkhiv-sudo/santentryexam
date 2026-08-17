import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { logAdmin, getRequestMeta } from "@/lib/audit-log";

/**
 * POST /api/admin/retakes/approve
 * Body: { requestIds: string[] }
 *
 * Дахин шалгалт өгөх хүсэлтийг зөвшөөрнө.
 *
 * ЯАГААД СЕРВЕР ТАЛД ВЭ: энэ урсгал нь сурагчийн хуучин `submissions`-ыг
 * устгах ёстой (эс бөгөөс questions/submit route-ийн "аль хэдийн өгсөн"
 * хамгаалалт дахин орохыг нь хаана). Гэтэл firestore.rules дээр
 * `submissions` нь `create, update, delete: if false` — клиент талаас
 * устгах боломжгүй тул writeBatch бүхэлдээ 403 болж, зөвшөөрөл ОГТ
 * ажиллахгүй байсан. Admin SDK нь rules-ыг тойрдог тул энд зөв ажиллана.
 */

interface RowResult {
    requestId: string;
    ok: boolean;
    studentName?: string;
    error?: string;
}

export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    const admin = await getCurrentUser();
    if (!admin || admin.role !== "admin") {
        return NextResponse.json({ error: "Зөвхөн админ хийх боломжтой" }, { status: 403 });
    }

    let body: { requestIds?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Буруу JSON" }, { status: 400 });
    }

    const requestIds = Array.isArray(body.requestIds)
        ? body.requestIds.filter((x): x is string => typeof x === "string")
        : [];
    if (requestIds.length === 0) {
        return NextResponse.json({ error: "requestIds шаардлагатай" }, { status: 400 });
    }
    if (requestIds.length > 200) {
        return NextResponse.json({ error: "Нэг удаад 200-аас олон хүсэлт зөвшөөрөх боломжгүй" }, { status: 400 });
    }

    const approveOne = async (requestId: string): Promise<RowResult> => {
        try {
            const reqRef = adminDb.collection("retake_requests").doc(requestId);
            const reqSnap = await reqRef.get();
            if (!reqSnap.exists) return { requestId, ok: false, error: "Хүсэлт олдсонгүй" };

            const req = reqSnap.data()!;
            const studentId = req.studentId as string;
            const examId = req.examId as string;
            const studentName = (req.studentName as string) || studentId;
            if (!studentId || !examId) {
                return { requestId, ok: false, studentName, error: "Хүсэлт дутуу мэдээлэлтэй" };
            }
            if (req.status === "approved") {
                return { requestId, ok: true, studentName }; // аль хэдийн зөвшөөрөгдсөн — дахин хийхгүй
            }

            // FIX F1: maxAttempts хязгаарыг шалгана (анхны оролдлого + зөвшөөрсөн retake-ууд)
            const examSnap = await adminDb.collection("exams").doc(examId).get();
            const maxAttempts = examSnap.exists ? (examSnap.data()?.maxAttempts as number | undefined) : undefined;
            if (typeof maxAttempts === "number" && maxAttempts > 0) {
                const approved = await adminDb.collection("retake_requests")
                    .where("studentId", "==", studentId)
                    .where("examId", "==", examId)
                    .where("status", "==", "approved")
                    .count().get();
                if (approved.data().count >= maxAttempts - 1) {
                    return { requestId, ok: false, studentName, error: `Дээд хязгаар (${maxAttempts} оролдлого) хэтэрсэн` };
                }
            }

            const [regSnap, resultsSnap, subsSnap] = await Promise.all([
                adminDb.collection("registrations").where("studentId", "==", studentId).where("examId", "==", examId).get(),
                adminDb.collection("exam_results").where("studentId", "==", studentId).where("examId", "==", examId).get(),
                adminDb.collection("submissions").where("studentId", "==", studentId).where("examId", "==", examId).get(),
            ]);

            const batch = adminDb.batch();

            batch.update(reqRef, { status: "approved", resolvedAt: Timestamp.now(), resolvedBy: admin.uid });

            // Бүртгэлийг "бүртгэлтэй" төлөвт буцааж, явцын талбаруудыг цэвэрлэнэ
            if (!regSnap.empty) {
                batch.update(regSnap.docs[0].ref, {
                    status: "registered",
                    startedAt: null,
                    completedAt: null,
                    draftAnswers: {},
                    violations: 0,
                    forceSubmitted: false,
                    // Хоцролтын хаалтыг тойрох тэмдэг: дахин өгөх зөвшөөрөл нь
                    // ихэвчлэн шалгалт эхэлснээс удаан хугацааны дараа өгөгддөг
                    // тул "10 минут өнгөрсөн" дүрэм үүнд үйлчлэх ёсгүй.
                    // Шалгалтын нийт хугацаа дуусах хаалт хэвээр үйлчилнэ.
                    retakeApprovedAt: Timestamp.now(),
                });
            }

            // Хуучин дүн, илгээлтийг устгана — эс бөгөөс дахин орох нь хаагдана
            resultsSnap.docs.forEach(d => batch.delete(d.ref));
            subsSnap.docs.forEach(d => batch.delete(d.ref));

            // Сурагчид мэдэгдэл
            batch.set(adminDb.collection("notifications").doc(), {
                recipientId: studentId,
                type: "retake_approved",
                title: "Дахин өгөх хүсэлт зөвшөөрөгдлөө",
                message: "Таны дахин шалгалт өгөх хүсэлт зөвшөөрөгдсөн. Шалгалт руу дахин орох боломжтой боллоо.",
                examId,
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            });

            await batch.commit();
            return { requestId, ok: true, studentName };
        } catch (err) {
            console.error("[retakes/approve] failed:", requestId, err);
            return { requestId, ok: false, error: err instanceof Error ? err.message : "Алдаа гарлаа" };
        }
    };

    const results: RowResult[] = [];
    const CHUNK = 5;
    for (let i = 0; i < requestIds.length; i += CHUNK) {
        results.push(...await Promise.all(requestIds.slice(i, i + CHUNK).map(approveOne)));
    }

    const successful = results.filter(r => r.ok).length;

    const meta = getRequestMeta(request);
    await logAdmin({
        action: "retake_approve",
        actorUid: admin.uid,
        actorRole: admin.role,
        metadata: { requested: requestIds.length, successful, failed: results.length - successful },
        ...meta,
    });

    return NextResponse.json({ successful, failed: results.length - successful, results });
}
