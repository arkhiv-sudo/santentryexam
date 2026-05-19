import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,

    doc,
    query,
    orderBy,
    where,
    limit,
    Timestamp,
    runTransaction,
} from "firebase/firestore";
import { Exam, Registration, Submission, ExamResult } from "@/types";

const EXAMS = "exams";
const REGISTRATIONS = "registrations";
const SUBMISSIONS = "submissions";
const EXAM_RESULTS = "exam_results";

// ─── In-memory cache ──────────────────────────────────────────────────────────
// FIX 39: In-memory cache LOCAL TO THE CLIENT BROWSER TAB.
// This is NOT shared across users or persisted to localStorage.
// Cleared on page reload. Purpose: avoid repeated Firestore lookups
// for the same student+exam registration within a single session so that
// saveDraftAnswers, recordViolation, etc. can skip the getDocs query and go
// straight to updateDoc — eliminating at least 1 read per autosave cycle.
const _regIdCache = new Map<string, string>();
function _regCacheKey(studentId: string, examId: string) { return `${studentId}__${examId}`; }
function _cachedRegId(studentId: string, examId: string) { return _regIdCache.get(_regCacheKey(studentId, examId)); }
function _setRegCache(studentId: string, examId: string, regId: string) {
    _regIdCache.set(_regCacheKey(studentId, examId), regId);
}

// ─── Timestamp conversion helper ─────────────────────────────────────────────
function toDate(value: unknown): Date {
    if (value instanceof Timestamp) return value.toDate();
    if (value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate();
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") return new Date(value);
    return new Date();
}

function examFromDoc(id: string, data: Record<string, unknown>): Exam {
    return {
        ...(data as Omit<Exam, "id" | "scheduledAt" | "registrationEndDate">),
        id,
        scheduledAt: toDate(data.scheduledAt),
        registrationEndDate: toDate(data.registrationEndDate),
    } as Exam;
}

export const ExamService = {
    // ── Read ──────────────────────────────────────────────────────────────────
    getAllExams: async (): Promise<Exam[]> => {
        const q = query(collection(db, EXAMS), orderBy("scheduledAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => examFromDoc(d.id, d.data() as Record<string, unknown>));
    },

    getExamById: async (id: string): Promise<Exam | null> => {
        const snapshot = await getDoc(doc(db, EXAMS, id));
        if (!snapshot.exists()) return null;
        return examFromDoc(snapshot.id, snapshot.data() as Record<string, unknown>);
    },

    // ── Write ─────────────────────────────────────────────────────────────────
    createExam: async (exam: Omit<Exam, "id">): Promise<string> => {
        const docRef = await addDoc(collection(db, EXAMS), exam);
        return docRef.id;
    },

    updateExam: async (id: string, updates: Partial<Omit<Exam, "id">>): Promise<void> => {
        // FIX 12: Guard against modifying critical fields on a published exam.
        // questionIds, grade, and duration cannot change after students may have already
        // registered or started the exam — doing so would corrupt their session data.
        const currentSnap = await getDoc(doc(db, EXAMS, id));
        if (currentSnap.data()?.status === 'published') {
            const ALLOWED_ON_PUBLISHED: Array<keyof Omit<Exam, "id">> = ['status', 'passingScore', 'maxAttempts'];
            const updateKeys = Object.keys(updates) as Array<keyof Omit<Exam, "id">>;
            const forbidden = updateKeys.filter(k => !ALLOWED_ON_PUBLISHED.includes(k));
            if (forbidden.length > 0) {
                throw new Error(`Нийтлэгдсэн шалгалтын ${forbidden.join(', ')} талбарыг өөрчлөх боломжгүй`);
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await updateDoc(doc(db, EXAMS, id), updates as any);
    },

    deleteExam: async (id: string): Promise<void> => {
        // FIX D2: Only delete the exam document. The onExamDelete Cloud Function
        // (functions/src/index.ts) cascades the deletion of registrations,
        // submissions, exam_results, and exam_answers. Performing the cascade here
        // as well would double-delete and slow the call down.
        //
        // TODO: Soft delete pattern
        // Currently deleteExam() does hard delete via Cloud Function cascade.
        // Production should:
        // 1. Set archivedAt timestamp instead of deleting
        // 2. Add scheduled function to hard-delete after 30 days
        // 3. Add admin "restore" button for archived items
        const { deleteDoc } = await import("firebase/firestore");
        await deleteDoc(doc(db, EXAMS, id));
    },

    // ── Registration ──────────────────────────────────────────────────────────

    /** Check if a student is already registered for an exam. Returns the registration or null. */
    getStudentRegistration: async (studentId: string, examId: string): Promise<Registration | null> => {
        const q = query(
            collection(db, REGISTRATIONS),
            where("studentId", "==", studentId),
            where("examId", "==", examId)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const d = snapshot.docs[0];
        // ✅ Cache the reg ID to avoid re-querying in saveDraftAnswers / recordViolation
        _setRegCache(studentId, examId, d.id);
        const data = d.data() as Record<string, unknown>;
        return {
            id: d.id,
            studentId: data.studentId as string,
            examId: data.examId as string,
            status: data.status as Registration["status"],
            registeredAt: toDate(data.registeredAt),
            startedAt: data.startedAt ? toDate(data.startedAt) : undefined,
            completedAt: data.completedAt ? toDate(data.completedAt) : undefined,
            violations: (data.violations as number) || 0,
            draftAnswers: data.draftAnswers as Record<string, string> | undefined,
        };
    },

    /** Register a student for an exam. Returns registration ID (idempotent — returns existing ID if already registered). */
    registerForExam: async (studentId: string, examId: string): Promise<string> => {
        // Check for existing registration before creating
        const existing = await ExamService.getStudentRegistration(studentId, examId);
        if (existing) return existing.id; // already registered — return existing ID

        // FIX C1: Enforce registrationEndDate + status server-side before creating registration.
        const examSnap = await getDoc(doc(db, EXAMS, examId));
        if (!examSnap.exists()) throw new Error("Шалгалт олдсонгүй");
        const examData = examSnap.data();
        if (examData.status !== "published") {
            throw new Error("Шалгалт нийтлэгдээгүй байна");
        }
        const regEndRaw = examData.registrationEndDate;
        const regEnd = regEndRaw?.toDate ? regEndRaw.toDate() : (regEndRaw ? new Date(regEndRaw) : null);
        if (regEnd && new Date() > regEnd) {
            throw new Error("Бүртгэлийн хугацаа дууссан байна");
        }

        const docRef = await addDoc(collection(db, REGISTRATIONS), {
            studentId,
            examId,
            status: "registered",
            registeredAt: Timestamp.now(),
            violations: 0,
        });
        // ✅ Cache the new reg ID immediately
        _setRegCache(studentId, examId, docRef.id);
        return docRef.id;
    },

    /** Mark exam as started and return the registration id. */
    startExam: async (studentId: string, examId: string): Promise<string> => {
        const reg = await ExamService.getStudentRegistration(studentId, examId);
        if (!reg) throw new Error("Not registered for this exam");
        if (reg.status === "completed") throw new Error("Exam already completed");
        
        // Fetch student IP address
        let ipAddress = "";
        try {
            const res = await fetch("https://api.ipify.org?format=json");
            const data = await res.json();
            ipAddress = data.ip;
        } catch (e) {
            console.warn("Could not fetch IP", e);
        }

        // Already started – don't overwrite startedAt on page reload
        if (reg.status === "started") {
            if (ipAddress && !reg.ipAddress) {
                await updateDoc(doc(db, REGISTRATIONS, reg.id), { ipAddress });
            }
            return reg.id;
        }

        await updateDoc(doc(db, REGISTRATIONS, reg.id), {
            status: "started",
            startedAt: Timestamp.now(),
            ipAddress,
        });
        return reg.id;
    },

    /** Save draft answers to the registration document for resuming.
     *  ✅ OPTIMIZED: uses in-memory reg ID cache to skip the getDocs query. */
    saveDraftAnswers: async (studentId: string, examId: string, answers: Record<string, string>): Promise<void> => {
        const cachedId = _cachedRegId(studentId, examId);
        if (cachedId) {
            // Fast path: direct write, no read needed
            await updateDoc(doc(db, REGISTRATIONS, cachedId), { draftAnswers: answers });
            return;
        }
        // Fallback: look up the registration (also populates cache)
        const reg = await ExamService.getStudentRegistration(studentId, examId);
        if (!reg) return;
        await updateDoc(doc(db, REGISTRATIONS, reg.id), { draftAnswers: answers });
    },

    /** Record a cheating violation for a registration.
     *  FIX 24: Uses runTransaction to read+increment atomically. Replaces the prior
     *  updateDoc+getDoc pattern which had a race window where two concurrent
     *  violation reports could undercount. */
    recordViolation: async (studentId: string, examId: string): Promise<number> => {
        const cachedId = _cachedRegId(studentId, examId);

        if (cachedId) {
            const regRef = doc(db, REGISTRATIONS, cachedId);
            return await runTransaction(db, async (tx) => {
                const snap = await tx.get(regRef);
                if (!snap.exists()) throw new Error("Бүртгэл олдсонгүй");
                const current = (snap.data().violations as number | undefined) || 0;
                const next = current + 1;
                tx.update(regRef, { violations: next });
                return next;
            });
        }

        // Fallback: look up registration first
        const q = query(
            collection(db, REGISTRATIONS),
            where("studentId", "==", studentId),
            where("examId", "==", examId),
            limit(1)
        );
        const snap = await getDocs(q);
        if (snap.empty) throw new Error("Бүртгэл олдсонгүй");

        const regId = snap.docs[0].id;
        _setRegCache(studentId, examId, regId);

        const regRef = doc(db, REGISTRATIONS, regId);
        return await runTransaction(db, async (tx) => {
            const s = await tx.get(regRef);
            const current = (s.data()?.violations as number | undefined) || 0;
            const next = current + 1;
            tx.update(regRef, { violations: next });
            return next;
        });
    },

    /** Get all exam IDs a student is registered for. */
    getStudentRegistrations: async (studentId: string): Promise<string[]> => {
        const q = query(collection(db, REGISTRATIONS), where("studentId", "==", studentId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => d.data().examId as string);
    },

    /** Get full registration objects for a student. */
    getStudentRegistrationsFull: async (studentId: string): Promise<Registration[]> => {
        const q = query(collection(db, REGISTRATIONS), where("studentId", "==", studentId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => {
            const data = d.data() as Record<string, unknown>;
            // ✅ Populate cache for each registration returned
            _setRegCache(studentId, data.examId as string, d.id);
            return {
                id: d.id,
                studentId: data.studentId as string,
                examId: data.examId as string,
                status: data.status as Registration["status"],
                registeredAt: toDate(data.registeredAt),
                startedAt: data.startedAt ? toDate(data.startedAt) : undefined,
                completedAt: data.completedAt ? toDate(data.completedAt) : undefined,
                violations: (data.violations as number) || 0,
                draftAnswers: data.draftAnswers as Record<string, string> | undefined,
            };
        });
    },

    // ── Submission ────────────────────────────────────────────────────────────

    /** Check if student already submitted this exam. */
    getSubmissionByStudent: async (examId: string, studentId: string): Promise<Submission | null> => {
        const q = query(
            collection(db, SUBMISSIONS),
            where("examId", "==", examId),
            where("studentId", "==", studentId)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const d = snapshot.docs[0];
        const data = d.data() as Record<string, unknown>;
        return {
            ...(data as Omit<Submission, "id" | "submittedAt" | "gradedAt">),
            id: d.id,
            submittedAt: toDate(data.submittedAt),
            gradedAt: data.gradedAt ? toDate(data.gradedAt) : undefined,
        } as Submission;
    },

    // ── Results ───────────────────────────────────────────────────────────────

    /** Get all exam results for a student (from exam_results collection). */
    getStudentResults: async (studentId: string): Promise<ExamResult[]> => {
        const q = query(
            collection(db, EXAM_RESULTS),
            where("studentId", "==", studentId),
            orderBy("gradedAt", "desc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => {
            const data = d.data() as Record<string, unknown>;
            return {
                id: d.id,
                submissionId: data.submissionId as string,
                examId: data.examId as string,
                examTitle: data.examTitle as string,
                studentId: data.studentId as string,
                studentName: data.studentName as string,
                score: data.score as number,
                maxScore: data.maxScore as number,
                percentage: data.percentage as number,
                passed: data.passed as boolean ?? false,
                passingScore: data.passingScore as number ?? 0,
                rank: (data.rank as number | undefined) ?? undefined,
                gradedAt: toDate(data.gradedAt),
            } as ExamResult;
        });
    },

    /** Get results for multiple students (for parent dashboard). */
    getResultsForStudents: async (studentIds: string[]): Promise<ExamResult[]> => {
        if (studentIds.length === 0) return [];

        const results: ExamResult[] = [];
        // Firestore 'in' supports up to 10 values
        const chunks: string[][] = [];
        for (let i = 0; i < studentIds.length; i += 10) {
            chunks.push(studentIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const q = query(
                collection(db, EXAM_RESULTS),
                where("studentId", "in", chunk),
                orderBy("gradedAt", "desc")
            );
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(d => {
                const data = d.data() as Record<string, unknown>;
                results.push({
                    id: d.id,
                    submissionId: data.submissionId as string,
                    examId: data.examId as string,
                    examTitle: data.examTitle as string,
                    studentId: data.studentId as string,
                    studentName: data.studentName as string,
                    score: data.score as number,
                    maxScore: data.maxScore as number,
                    percentage: data.percentage as number,
                    passed: data.passed as boolean ?? false,
                    passingScore: data.passingScore as number ?? 0,
                    rank: (data.rank as number | undefined) ?? undefined,
                    gradedAt: toDate(data.gradedAt),
                });
            });
        }

        return results.sort((a, b) => b.gradedAt.getTime() - a.gradedAt.getTime());
    },

    // ── Admin: force-submit using server-side draft ─────────────────────────────
    /** B2: Admin-initiated submission for a student who can no longer self-submit
     *  (e.g. went offline mid-exam). Reads the latest draftAnswers from the
     *  registration and POSTs to /api/exam/[examId]/submit with adminOverride so
     *  the server uses targetStudentId rather than the caller's UID. */
    forceSubmitFromDraft: async (studentId: string, examId: string, adminUid: string) => {
        const regQuery = query(
            collection(db, REGISTRATIONS),
            where("studentId", "==", studentId),
            where("examId", "==", examId),
            limit(1),
        );
        const regSnap = await getDocs(regQuery);
        if (regSnap.empty) throw new Error("Бүртгэл олдсонгүй");

        const reg = regSnap.docs[0];
        const regData = reg.data();
        const draftAnswers = (regData.draftAnswers as Record<string, string>) || {};

        const response = await fetch(`/api/exam/${examId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                answers: draftAnswers,
                timeTaken: 0,
                studentName: (regData.studentName as string) || "",
                adminOverride: true,
                adminUid,
                targetStudentId: studentId,
            }),
        });

        if (!response.ok) {
            let msg = "Server force-submit failed";
            try {
                const err = await response.json();
                if (err?.error) msg = err.error;
            } catch { /* ignore parse errors */ }
            throw new Error(msg);
        }
        return response.json();
    },
};
