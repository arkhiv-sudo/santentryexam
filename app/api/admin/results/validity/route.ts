import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { logAdmin, getRequestMeta } from "@/lib/audit-log";

/**
 * POST /api/admin/results/validity
 * Body: { resultId: string, invalid: boolean }
 *
 * Дүрэм зөрчсөний улмаас "эргэлзээтэй" гэж тэмдэглэгдсэн дүнг админ
 * хүчинтэй болгох (invalid=false) эсвэл эргүүлж хүчингүй болгох (invalid=true).
 *
 * Тугийг `exam_results` болон холбоотой `submissions` хоёуланд нь нэг дор
 * бичнэ — эс бөгөөс админы харагдац болон анхны бичлэг зөрөх болно.
 * Клиент `submissions`-д бичих эрхгүй (firestore.rules) тул энэ нь Admin SDK-аар
 * л хийгдэх ёстой.
 */
export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    const admin = await getCurrentUser();
    if (!admin || admin.role !== "admin") {
        return NextResponse.json({ error: "Зөвхөн админ хийх боломжтой" }, { status: 403 });
    }

    let body: { resultId?: string; invalid?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Буруу JSON" }, { status: 400 });
    }

    const { resultId, invalid } = body;
    if (!resultId || typeof resultId !== "string" || typeof invalid !== "boolean") {
        return NextResponse.json({ error: "resultId (string) ба invalid (boolean) шаардлагатай" }, { status: 400 });
    }

    const resultRef = adminDb.collection("exam_results").doc(resultId);
    const resultSnap = await resultRef.get();
    if (!resultSnap.exists) {
        return NextResponse.json({ error: "Дүн олдсонгүй" }, { status: 404 });
    }
    const result = resultSnap.data()!;

    const batch = adminDb.batch();
    batch.update(resultRef, {
        invalidatedByViolation: invalid,
        // Хүчингүй дүн эрэмбэд ордоггүй тул rank-ыг цэвэрлэнэ. Хүчинтэй болгосон
        // тохиолдолд дараагийн илгээлт дээр эрэмбэ дахин тооцогдоно.
        ...(invalid ? { rank: null } : {}),
        validityUpdatedBy: admin.uid,
        validityUpdatedAt: new Date(),
    });

    if (result.submissionId) {
        const subRef = adminDb.collection("submissions").doc(result.submissionId as string);
        const subSnap = await subRef.get();
        if (subSnap.exists) {
            batch.update(subRef, { invalidatedByViolation: invalid });
        }
    }

    await batch.commit();

    const meta = getRequestMeta(request);
    await logAdmin({
        action: "bulk_action",
        actorUid: admin.uid,
        actorRole: admin.role,
        targetUid: result.studentId as string | undefined,
        targetResource: `exam_results/${resultId}`,
        metadata: {
            change: invalid ? "result_invalidated" : "result_validated",
            examId: result.examId ?? null,
            studentName: result.studentName ?? null,
        },
        ...meta,
    });

    return NextResponse.json({ success: true, invalidatedByViolation: invalid });
}
