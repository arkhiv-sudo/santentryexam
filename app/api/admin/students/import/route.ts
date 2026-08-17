import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { logAdmin, getRequestMeta } from "@/lib/audit-log";
import { generateExamCode, generateInternalPassword } from "@/lib/utils-server";
import { normalizePhone, normalizeGrade, cleanName } from "@/lib/students-import";

/**
 * POST /api/admin/students/import
 *
 * Creates (or refreshes) student accounts from an admin-uploaded Excel sheet.
 * Body: { students: [{ lastName, firstName, grade, phone }] }
 *
 * Each student gets:
 *   - a Firebase Auth user  (email `<phone>@student.internal`, strong random
 *     password that is never shown — they sign in via phone + examCode instead)
 *   - a `users` document with role 'student' and the short `examCode`
 *   - the `role: student` custom claim, set here rather than waiting for the
 *     onUserCreate Cloud Function, so login works immediately.
 *
 * Duplicate phone → the existing account is updated and a NEW code is issued
 * (the previous code stops working).
 */

const MAX_ROWS = 500;
const CHUNK_SIZE = 10;

type RowResult = {
    rowNumber: number;
    lastName: string;
    firstName: string;
    grade: string;
    phone: string;
    status: 'created' | 'updated' | 'error';
    examCode?: string;
    error?: string;
};

interface IncomingRow {
    rowNumber?: number;
    lastName?: unknown;
    firstName?: unknown;
    grade?: unknown;
    phone?: unknown;
}

export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    const admin = await getCurrentUser();
    if (!admin || admin.role !== "admin") {
        return NextResponse.json({ error: "Зөвхөн админ хийх боломжтой" }, { status: 403 });
    }

    let body: { students?: IncomingRow[] };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Буруу JSON" }, { status: 400 });
    }

    const incoming = Array.isArray(body.students) ? body.students : null;
    if (!incoming || incoming.length === 0) {
        return NextResponse.json({ error: "Сурагчийн жагсаалт хоосон байна" }, { status: 400 });
    }
    if (incoming.length > MAX_ROWS) {
        return NextResponse.json(
            { error: `Нэг удаад дээд тал нь ${MAX_ROWS} сурагч импортлох боломжтой` },
            { status: 400 }
        );
    }

    // ── Validate + normalise every row before touching Auth/Firestore ─────────
    const seenPhones = new Set<string>();
    const prepared = incoming.map((row, i): RowResult => {
        const rowNumber = typeof row.rowNumber === 'number' ? row.rowNumber : i + 1;
        const lastName = cleanName(row.lastName);
        const firstName = cleanName(row.firstName);
        const grade = normalizeGrade(row.grade);
        const phone = normalizePhone(row.phone);

        const base = { rowNumber, lastName, firstName, grade: grade ?? '', phone: phone ?? '' };
        if (!firstName) return { ...base, status: 'error', error: 'Нэр хоосон' };
        if (!grade) return { ...base, status: 'error', error: 'Анги буруу (1–12)' };
        if (!phone) return { ...base, status: 'error', error: 'Утасны дугаар буруу (8 орон)' };
        if (seenPhones.has(phone)) return { ...base, status: 'error', error: 'Файл дотор давхардсан утас' };
        seenPhones.add(phone);
        return { ...base, status: 'created' }; // provisional — resolved below
    });

    // ── Write, in small parallel chunks ───────────────────────────────────────
    const results: RowResult[] = [];

    const processRow = async (row: RowResult): Promise<RowResult> => {
        if (row.status === 'error') return row;

        const { phone, firstName, lastName, grade } = row;
        const email = `${phone}@student.internal`;
        const examCode = generateExamCode();
        const displayName = `${lastName} ${firstName}`.trim();

        try {
            // Existing account for this phone?
            const existingSnap = await adminDb.collection("users")
                .where("phone", "==", phone)
                .limit(1)
                .get();

            if (!existingSnap.empty) {
                const existingDoc = existingSnap.docs[0];
                // Never overwrite a parent/teacher/admin account that happens to
                // carry this phone number — that would hand them a student login.
                if (existingDoc.data().role !== 'student') {
                    return {
                        ...row,
                        status: 'error',
                        error: 'Энэ дугаар сурагч бус бүртгэлд ашиглагдсан байна',
                    };
                }
                const docRef = existingDoc.ref;
                await docRef.set({
                    firstName,
                    lastName,
                    grade,
                    class: `${grade}-р анги`,
                    examCode,
                    codeUpdatedAt: FieldValue.serverTimestamp(),
                    isImported: true,
                    status: 'active',
                }, { merge: true });

                // Keep the Auth record in sync (display name + re-enable if archived)
                try {
                    await adminAuth.updateUser(docRef.id, { displayName, disabled: false });
                } catch {
                    // Auth record may be missing for legacy rows — non-fatal
                }
                return { ...row, status: 'updated', examCode };
            }

            // New account
            let uid: string;
            try {
                const created = await adminAuth.createUser({
                    email,
                    password: generateInternalPassword(),
                    displayName,
                });
                uid = created.uid;
            } catch (err: unknown) {
                const code = (err as { code?: string })?.code;
                if (code === 'auth/email-already-exists') {
                    // Auth user exists but no Firestore doc carries this phone —
                    // adopt the existing Auth record instead of failing the row.
                    const existingUser = await adminAuth.getUserByEmail(email);
                    uid = existingUser.uid;
                    await adminAuth.updateUser(uid, { displayName, disabled: false });
                } else {
                    throw err;
                }
            }

            await adminAuth.setCustomUserClaims(uid, { role: 'student' });

            await adminDb.collection("users").doc(uid).set({
                uid,
                email,
                role: 'student',
                firstName,
                lastName,
                grade,
                class: `${grade}-р анги`,
                phone,
                examCode,
                isImported: true,
                status: 'active',
                importedAt: FieldValue.serverTimestamp(),
                importedBy: admin.uid,
                codeUpdatedAt: FieldValue.serverTimestamp(),
                createdAt: FieldValue.serverTimestamp(),
            });

            return { ...row, status: 'created', examCode };
        } catch (err: unknown) {
            console.error('[students/import] row failed:', phone, err);
            return {
                ...row,
                status: 'error',
                error: err instanceof Error ? err.message : 'Үүсгэхэд алдаа гарлаа',
            };
        }
    };

    for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
        const chunk = prepared.slice(i, i + CHUNK_SIZE);
        const settled = await Promise.all(chunk.map(processRow));
        results.push(...settled);
    }

    const summary = {
        created: results.filter(r => r.status === 'created').length,
        updated: results.filter(r => r.status === 'updated').length,
        failed: results.filter(r => r.status === 'error').length,
    };

    const meta = getRequestMeta(request);
    await logAdmin({
        action: 'student_import',
        actorUid: admin.uid,
        actorRole: admin.role,
        metadata: { total: results.length, ...summary },
        ...meta,
    });

    return NextResponse.json({ success: true, summary, results });
}
