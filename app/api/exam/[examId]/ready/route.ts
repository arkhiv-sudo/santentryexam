import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { checkOrigin } from "@/lib/csrf";

/**
 * POST /api/exam/[examId]/ready
 *
 * Сурагч «Шалгалт эхлэх» дарахад дуудагдана. ТУХАЙН СУРАГЧИЙН шалгалт
 * яг тэр мөчид эхэлж, хугацаа нь өөрийнх нь `startedAt`-аас тоологдоно
 * (админы зөвшөөрөл шаардлагагүй, шалгалт үргэлж нээлттэй).
 *
 * Аль хэдийн эхэлсэн бол хуучин `startedAt`-ыг ХЭВЭЭР үлдээж буцаана —
 * ингэснээр хуудсаа сэргээх, дахин орох үед цаг тэглэгдэхгүй.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
    const origin = checkOrigin(req);
    if (!origin.ok) return origin.response;

    const { examId } = await params;
    const sessionCookie = (await cookies()).get("__session")?.value;
    if (!sessionCookie) return NextResponse.json({ error: "Нэвтрээгүй байна" }, { status: 401 });

    let uid: string;
    try {
        uid = (await adminAuth.verifySessionCookie(sessionCookie, true)).uid;
    } catch {
        return NextResponse.json({ error: "Сессион хүчингүй" }, { status: 401 });
    }

    const examSnap = await adminDb.collection("exams").doc(examId).get();
    if (!examSnap.exists) return NextResponse.json({ error: "Шалгалт олдсонгүй" }, { status: 404 });
    const exam = examSnap.data()!;
    if (exam.status !== "published") {
        return NextResponse.json({ error: "Шалгалт нийтлэгдээгүй байна" }, { status: 403 });
    }

    const regSnap = await adminDb.collection("registrations")
        .where("examId", "==", examId).where("studentId", "==", uid).limit(1).get();
    if (regSnap.empty) return NextResponse.json({ error: "Шалгалтад бүртгэлгүй байна" }, { status: 403 });

    const reg = regSnap.docs[0];
    const data = reg.data();
    if (data.status === "completed") {
        return NextResponse.json({ error: "Та энэ шалгалтыг аль хэдийн өгсөн байна" }, { status: 403 });
    }

    // Аль хэдийн эхэлсэн бол цагийг нь ХЭВЭЭР үлдээнэ
    const existing: number | null = data.startedAt?.toMillis?.() ?? null;
    if (existing) {
        return NextResponse.json({ success: true, status: "started", startedAt: existing, resumed: true });
    }

    const now = Timestamp.now();
    await reg.ref.update({ status: "started", startedAt: now });
    return NextResponse.json({ success: true, status: "started", startedAt: now.toMillis(), resumed: false });
}
