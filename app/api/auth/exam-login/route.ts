import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { checkOrigin } from "@/lib/csrf";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/students-import";

/**
 * POST /api/auth/exam-login
 * Body: { phone: string, code: string }
 *
 * Утас + богино кодоор нэвтрэх (Excel импортоор үүссэн сурагчид). Амжилттай
 * бол Firebase custom token болон тухайн ангийн НЭЭЛТТЭЙ шалгалтуудыг буцаана.
 *
 * Код богино тул хамгаалалт нь урт биш, оролдлогын хязгаарт байна:
 *   - утас бүрд: ATTEMPT_WINDOW_MS дотор MAX_ATTEMPTS алдаа → түгжинэ
 *     (тоолуур Firestore-д — serverless дээр ч, олон instance дээр ч ажиллана)
 *   - IP бүрд: санах ойн бүдүүн хязгаар (утас таах оролдлогыг сааруулна)
 */

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 минут
const ATTEMPTS_COLLECTION = "exam_login_attempts";

const GENERIC_ERROR = "Утасны дугаар эсвэл код буруу байна";

function codesMatch(input: string, expected: string): boolean {
    const a = Buffer.from(input.trim().toUpperCase(), "utf8");
    const b = Buffer.from(expected.trim().toUpperCase(), "utf8");
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    const ipLimit = rateLimit(getRateLimitKey(request, "exam-login"), 30, 10 * 60 * 1000);
    if (!ipLimit.allowed) {
        return NextResponse.json(
            { error: "Хэт олон оролдлого. Хэсэг хүлээгээд дахин оролдоно уу." },
            { status: 429 }
        );
    }

    let body: { phone?: unknown; code?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Буруу хүсэлт" }, { status: 400 });
    }

    const phone = normalizePhone(body.phone);
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

    if (!phone || !code || !/^[A-Z0-9]{1,12}$/.test(code)) {
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const attemptsRef = adminDb.collection(ATTEMPTS_COLLECTION).doc(phone);
    const now = Date.now();

    // ── Түгжээ шалгах ────────────────────────────────────────────────────────
    try {
        const attemptsSnap = await attemptsRef.get();
        if (attemptsSnap.exists) {
            const data = attemptsSnap.data()!;
            const firstAt = (data.firstAt as number) || 0;
            const count = (data.count as number) || 0;
            if (count >= MAX_ATTEMPTS && now - firstAt < ATTEMPT_WINDOW_MS) {
                const waitMin = Math.ceil((ATTEMPT_WINDOW_MS - (now - firstAt)) / 60000);
                return NextResponse.json(
                    { error: `Хэт олон буруу оролдлого. ${waitMin} минутын дараа дахин оролдоно уу.` },
                    { status: 429 }
                );
            }
        }
    } catch (err) {
        console.error("[exam-login] attempts read failed:", err);
    }

    const registerFailure = async () => {
        try {
            await adminDb.runTransaction(async tx => {
                const snap = await tx.get(attemptsRef);
                const data = snap.exists ? snap.data()! : null;
                const firstAt = (data?.firstAt as number) || 0;
                const withinWindow = data && now - firstAt < ATTEMPT_WINDOW_MS;
                tx.set(attemptsRef, {
                    count: withinWindow ? ((data?.count as number) || 0) + 1 : 1,
                    firstAt: withinWindow ? firstAt : now,
                    lastAt: now,
                });
            });
        } catch (err) {
            console.error("[exam-login] attempts write failed:", err);
        }
    };

    // ── Сурагчийг хайх ───────────────────────────────────────────────────────
    let userDoc;
    try {
        const snap = await adminDb.collection("users").where("phone", "==", phone).limit(1).get();
        userDoc = snap.empty ? null : snap.docs[0];
    } catch (err) {
        console.error("[exam-login] user lookup failed:", err);
        return NextResponse.json({ error: "Серверийн алдаа" }, { status: 500 });
    }

    if (!userDoc) {
        await registerFailure();
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const user = userDoc.data();
    const storedCode = typeof user.examCode === "string" ? user.examCode : "";

    if (!storedCode || !codesMatch(code, storedCode)) {
        await registerFailure();
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }
    if (user.role !== "student") {
        await registerFailure();
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }
    if (user.status === "archived") {
        return NextResponse.json({ error: "Таны бүртгэл идэвхгүй болсон байна. Админд хандана уу." }, { status: 403 });
    }

    // ── Амжилттай ────────────────────────────────────────────────────────────
    await attemptsRef.delete().catch(() => {});

    let token: string;
    try {
        token = await adminAuth.createCustomToken(userDoc.id, { role: "student" });
    } catch (err) {
        console.error("[exam-login] custom token failed:", err);
        return NextResponse.json({ error: "Нэвтрэхэд алдаа гарлаа" }, { status: 500 });
    }

    // ── Тухайн ангийн нээлттэй шалгалтууд ────────────────────────────────────
    // Огноогоор БИШ төлөвөөр шүүнэ: нийтлэгдсэн бөгөөд хугацаа нь дуусаагүй
    // (эхлээгүй = нээлттэй, эхэлсэн = явагдаж байна).
    const grade = String(user.grade || "");
    let exams: { id: string; title: string; duration: number; started: boolean; startedAt: number | null }[] = [];
    if (grade) {
        try {
            const examSnap = await adminDb.collection("exams")
                .where("status", "==", "published")
                .where("grade", "==", grade)
                .get();

            exams = examSnap.docs
                .map(d => {
                    const e = d.data();
                    const startedAt: number | null = e.startedAt?.toMillis?.() ?? null;
                    const duration: number = e.duration || 60;
                    return {
                        id: d.id,
                        title: (e.title as string) || "Шалгалт",
                        duration,
                        started: !!startedAt,
                        startedAt,
                        // Шалгалт үргэлж нээлттэй — хугацаа нь сурагч бүрд
                        // өөрийн эхэлсэн мөчөөс тоологддог тул энд шүүхгүй.
                        finished: false,
                    };
                })
                .filter(e => !e.finished)
                .sort((a, b) => (a.startedAt ?? Number.MAX_SAFE_INTEGER) - (b.startedAt ?? Number.MAX_SAFE_INTEGER))
                .map(({ finished: _finished, ...rest }) => rest);
        } catch (err) {
            console.error("[exam-login] exam lookup failed:", err);
        }
    }

    return NextResponse.json({
        token,
        student: {
            uid: userDoc.id,
            firstName: (user.firstName as string) || "",
            lastName: (user.lastName as string) || "",
            grade,
        },
        exams,
    });
}
