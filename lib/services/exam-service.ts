import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    where,
    Timestamp,
} from "firebase/firestore";
import { Exam, Registration, Submission, ExamResult } from "@/types";

const EXAMS = "exams";
const REGISTRATIONS = "registrations";
const SUBMISSIONS = "submissions";
const EXAM_RESULTS = "exam_results";

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Stores the Firestore document ID for a given studentId+examId pair so that
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await updateDoc(doc(db, EXAMS, id), updates as any);
    },

    deleteExam: async (id: string): Promise<void> => {
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

    /** Register a student for an exam (no-op if already registered). */
    registerForExam: async (studentId: string, examId: string): Promise<void> => {
        const existing = await ExamService.getStudentRegistration(studentId, examId);
        if (existing) return; // already registered

        const docRef = await addDoc(collection(db, REGISTRATIONS), {
            studentId,
            examId,
            status: "registered",
            registeredAt: Timestamp.now(),
            violations: 0,
        });
        // ✅ Cache the new reg ID immediately
        _setRegCache(studentId, examId, docRef.id);
    },

    /** Mark exam as started and return the registration id. */
    startExam: async (studentId: string, examId: string): Promise<string> => {
        const reg = await ExamService.getStudentRegistration(studentId, examId);
        if (!reg) throw new Error("Not registered for this exam");
        if (reg.status === "completed") throw new Error("Exam already completed");
        // Already started – don't overwrite startedAt on page reload
        if (reg.status === "started") return reg.id;

        await updateDoc(doc(db, REGISTRATIONS, reg.id), {
            status: "started",
            startedAt: Timestamp.now(),
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
     *  ✅ OPTIMIZED: uses in-memory reg ID cache to skip the getDocs query. */
    recordViolation: async (studentId: string, examId: string): Promise<number> => {
        const cachedId = _cachedRegId(studentId, examId);
        if (cachedId) {
            // Fast path: we don't know current count from cache alone, but
            // we use Firestore FieldValue.increment to avoid a read entirely.
            const { increment } = await import("firebase/firestore");
            await updateDoc(doc(db, REGISTRATIONS, cachedId), {
                violations: increment(1)
            });
            // Return a safe estimate (the UI reads it from state anyway)
            return 0;
        }
        // Fallback path: full read
        const reg = await ExamService.getStudentRegistration(studentId, examId);
        if (!reg) return 0;
        const newCount = (reg.violations || 0) + 1;
        await updateDoc(doc(db, REGISTRATIONS, reg.id), { violations: newCount });
        return newCount;
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
};
