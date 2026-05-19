import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc, query, where, orderBy, Timestamp, serverTimestamp, writeBatch } from "firebase/firestore";

export interface RetakeRequest {
    id: string;
    studentId: string;
    studentName: string;
    examId: string;
    examTitle: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: Date;
    resolvedAt?: Date;
}

const RETAKE_REQUESTS = "retake_requests";
const REGISTRATIONS = "registrations";
const EXAM_RESULTS = "exam_results";

export const RetakeService = {
    /** Request a retake for a specific exam */
    requestRetake: async (data: Omit<RetakeRequest, "id" | "status" | "createdAt">): Promise<string> => {
        const docRef = await addDoc(collection(db, RETAKE_REQUESTS), {
            ...data,
            status: "pending",
            createdAt: Timestamp.now(),
        });
        return docRef.id;
    },

    /** Check if a student already has a pending or approved request for an exam */
    getStudentRequest: async (studentId: string, examId: string): Promise<RetakeRequest | null> => {
        const q = query(
            collection(db, RETAKE_REQUESTS),
            where("studentId", "==", studentId),
            where("examId", "==", examId)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        
        // Find the most recent one by sorting client-side to avoid composite index requirement
        const docs = snapshot.docs.map(d => {
            const data = d.data();
            return {
                ...data,
                id: d.id,
                createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
                resolvedAt: data.resolvedAt?.toDate?.() || (data.resolvedAt ? new Date(data.resolvedAt) : undefined),
            } as RetakeRequest;
        }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return docs[0];
    },

    /** Get all retake requests for admin */
    getAllRequests: async (): Promise<RetakeRequest[]> => {
        const q = query(collection(db, RETAKE_REQUESTS), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => {
            const data = d.data();
            return {
                ...data,
                id: d.id,
                createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
                resolvedAt: data.resolvedAt?.toDate?.() || (data.resolvedAt ? new Date(data.resolvedAt) : undefined),
            } as RetakeRequest;
        });
    },

    /** Admin approves the request, resetting the registration and old exam results.
     *  FIX 3 & FIX 18: Uses a single Firestore writeBatch for atomicity. Also deletes
     *  the existing submission so the duplicate-submission guard in the questions/submit
     *  routes does not block the student from retaking the exam.
     *  FIX F1: Enforce exam.maxAttempts (original + retakes) before approving. */
    approveRequest: async (requestId: string, studentId: string, examId: string): Promise<void> => {
        // FIX F1: Check max attempts. If exam.maxAttempts is set, count existing approved
        // retakes for this student+exam and refuse to approve when the cap is reached.
        const examSnap = await getDoc(doc(db, "exams", examId));
        if (examSnap.exists()) {
            const examData = examSnap.data() as { maxAttempts?: number };
            if (typeof examData.maxAttempts === "number" && examData.maxAttempts > 0) {
                const approvedSnap = await getDocs(query(
                    collection(db, RETAKE_REQUESTS),
                    where("studentId", "==", studentId),
                    where("examId", "==", examId),
                    where("status", "==", "approved"),
                ));
                if (approvedSnap.size >= examData.maxAttempts - 1) {
                    throw new Error(`Дээд хязгаар (${examData.maxAttempts}) хэтэрсэн`);
                }
            }
        }

        const batch = writeBatch(db);

        // 1. Update request status
        batch.update(doc(db, RETAKE_REQUESTS, requestId), {
            status: "approved",
            resolvedAt: Timestamp.now()
        });

        // 2. Reset registration: set status back to "registered" and clear all in-progress fields
        const regSnapshot = await getDocs(query(collection(db, REGISTRATIONS), where("studentId", "==", studentId), where("examId", "==", examId)));
        if (!regSnapshot.empty) {
            const regRef = doc(db, REGISTRATIONS, regSnapshot.docs[0].id);
            batch.update(regRef, {
                status: "registered",
                startedAt: null,
                completedAt: null,
                draftAnswers: {},
                violations: 0,
                forceSubmitted: false,
            });
        }

        // 3. Delete existing exam results so they don't appear in rankings or past grades
        const resultsSnapshot = await getDocs(query(collection(db, EXAM_RESULTS), where("studentId", "==", studentId), where("examId", "==", examId)));
        resultsSnapshot.docs.forEach(r => batch.delete(doc(db, EXAM_RESULTS, r.id)));

        // 4. FIX 3: Delete existing submissions so the duplicate-submission check in
        //    /api/exam/[examId]/questions and /api/exam/[examId]/submit doesn't block the retake.
        const subsSnapshot = await getDocs(query(collection(db, "submissions"), where("studentId", "==", studentId), where("examId", "==", examId)));
        subsSnapshot.docs.forEach(d => batch.delete(doc(db, "submissions", d.id)));

        // Commit all changes atomically
        await batch.commit();

        // Notify student of approval (outside batch — not critical path)
        await addDoc(collection(db, "notifications"), {
            recipientId: studentId,
            type: "retake_approved",
            title: "Дахин өгөх хүсэлт зөвшөөрөгдлөө",
            message: "Таны дахин шалгалт өгөх хүсэлт зөвшөөрөгдсөн.",
            read: false,
            createdAt: serverTimestamp(),
        });
    },

    /** FIX C3: Bulk approve a list of retake requests. Reads each request to obtain
     *  studentId/examId and reuses the per-request approveRequest implementation. */
    bulkApprove: async (requestIds: string[]): Promise<{ successful: number; failed: number }> => {
        const results = await Promise.allSettled(
            requestIds.map(async (id) => {
                const snap = await getDoc(doc(db, RETAKE_REQUESTS, id));
                if (!snap.exists()) throw new Error("Request not found");
                const data = snap.data() as { studentId: string; examId: string };
                await RetakeService.approveRequest(id, data.studentId, data.examId);
            })
        );
        const successful = results.filter(r => r.status === "fulfilled").length;
        const failed = results.length - successful;
        return { successful, failed };
    },

    /** FIX C3: Bulk reject a list of retake requests. */
    bulkReject: async (requestIds: string[]): Promise<{ successful: number; failed: number }> => {
        const results = await Promise.allSettled(
            requestIds.map(async (id) => {
                const snap = await getDoc(doc(db, RETAKE_REQUESTS, id));
                if (!snap.exists()) throw new Error("Request not found");
                const data = snap.data() as { studentId?: string };
                await RetakeService.rejectRequest(id, data.studentId);
            })
        );
        const successful = results.filter(r => r.status === "fulfilled").length;
        const failed = results.length - successful;
        return { successful, failed };
    },

    /** Admin rejects the request */
    rejectRequest: async (requestId: string, studentId?: string): Promise<void> => {
        await updateDoc(doc(db, RETAKE_REQUESTS, requestId), {
            status: "rejected",
            resolvedAt: Timestamp.now()
        });

        // Notify student of rejection if studentId is provided
        if (studentId) {
            await addDoc(collection(db, "notifications"), {
                recipientId: studentId,
                type: "retake_rejected",
                title: "Дахин өгөх хүсэлт татгалзагдлаа",
                message: "Таны дахин шалгалт өгөх хүсэлт татгалзагдсан байна. Дэлгэрэнгүй мэдээлэл авахыг хүсвэл багш эсвэл админтай холбогдоно уу.",
                read: false,
                createdAt: serverTimestamp(),
            });
        }
    }
};
