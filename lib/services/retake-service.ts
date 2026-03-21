import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, query, where, orderBy, Timestamp, deleteDoc } from "firebase/firestore";

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

    /** Admin approves the request, resetting the registration and old exam results */
    approveRequest: async (requestId: string, studentId: string, examId: string): Promise<void> => {
        const batchPromises: Promise<void>[] = [];

        // 1. Update request status
        batchPromises.push(
            updateDoc(doc(db, RETAKE_REQUESTS, requestId), {
                status: "approved",
                resolvedAt: Timestamp.now()
            })
        );

        // 2. Clear registration record (reset status to "registered", remove times, answers)
        const regSnapshot = await getDocs(query(collection(db, REGISTRATIONS), where("studentId", "==", studentId), where("examId", "==", examId)));
        if (!regSnapshot.empty) {
            const regId = regSnapshot.docs[0].id;
            batchPromises.push(
                updateDoc(doc(db, REGISTRATIONS, regId), {
                    status: "registered",
                    startedAt: null,
                    completedAt: null,
                    draftAnswers: null,
                    violations: 0
                })
            );
        }

        // 3. Delete existing exam result so they don't show up in rankings or past grades
        const resultsSnapshot = await getDocs(query(collection(db, EXAM_RESULTS), where("studentId", "==", studentId), where("examId", "==", examId)));
        resultsSnapshot.forEach(r => {
            batchPromises.push(deleteDoc(doc(db, EXAM_RESULTS, r.id)));
        });

        // Submissions can remain for historical auditing, or we could delete them.
        // For now, leaving submissions is fine as long as ExamResult is cleared and Registration is reset.

        await Promise.all(batchPromises);
    },

    /** Admin rejects the request */
    rejectRequest: async (requestId: string): Promise<void> => {
        await updateDoc(doc(db, RETAKE_REQUESTS, requestId), {
            status: "rejected",
            resolvedAt: Timestamp.now()
        });
    }
};
