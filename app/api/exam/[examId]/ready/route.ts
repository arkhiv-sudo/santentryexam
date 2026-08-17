import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { checkOrigin } from "@/lib/csrf";

/**
 * POST /api/exam/[examId]/ready
 *
 * Сурагч «Бэлэн боллоо» дарахад дуудагдана. Бүртгэлийг `ready` төлөвт
 * оруулж, админы хүснэгтэд ногоон болж харагдана. Асуулт ЭНД ӨГӨХГҮЙ —
 * шалгалт зөвхөн админ «Бүгдэд эхлүүлэх» дарсны дараа эхэлнэ.
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
    const status = reg.data().status as string;
    if (status === "completed") {
        return NextResponse.json({ error: "Та энэ шалгалтыг аль хэдийн өгсөн байна" }, { status: 403 });
    }

    // Шалгалт аль хэдийн эхэлсэн бол: зөвхөн өмнө нь бэлэн байсан эсвэл админ
    // тусгайлан оруулсан сурагч л үргэлжлүүлнэ.
    const alreadyStarted = !!exam.startedAt;
    if (alreadyStarted && status === "registered" && !reg.data().admittedLate) {
        return NextResponse.json({
            error: "Шалгалт аль хэдийн эхэлсэн байна. Багш/админд хандаж оруулах хүсэлт тавина уу.",
            needsAdmission: true,
        }, { status: 403 });
    }

    await reg.ref.update({
        status: alreadyStarted ? "started" : "ready",
        readyAt: Timestamp.now(),
        ...(alreadyStarted ? { startedAt: Timestamp.now() } : {}),
    });

    return NextResponse.json({
        success: true,
        status: alreadyStarted ? "started" : "ready",
        examStartedAt: exam.startedAt?.toMillis?.() ?? null,
    });
}
