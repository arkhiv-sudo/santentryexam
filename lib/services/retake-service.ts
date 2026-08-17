import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc, query, where, orderBy, Timestamp, serverTimestamp } from "firebase/firestore";

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

    /** Админ хүсэлтийг зөвшөөрнө.
     *
     *  Энэ ажил СЕРВЕР талд хийгддэг (`/api/admin/retakes/approve`): урсгал нь
     *  сурагчийн хуучин `submissions`-ыг устгах ёстой бөгөөд firestore.rules нь
     *  клиентээс тэрийг устгахыг хориглодог (`delete: if false`). Өмнө нь энэ
     *  бүхэн нэг writeBatch дотор клиент талаас хийгдэж байсан тул 403 болж,
     *  дахин өгөх зөвшөөрөл огт ажиллахгүй байв. */
    approveRequest: async (requestId: string): Promise<void> => {
        const { successful, results } = await RetakeService._callApprove([requestId]);
        if (successful === 0) {
            throw new Error(results[0]?.error || "Зөвшөөрөхөд алдаа гарлаа");
        }
    },

    /** Олон хүсэлтийг нэг дор зөвшөөрнө. */
    bulkApprove: async (requestIds: string[]): Promise<{ successful: number; failed: number }> => {
        const { successful, failed } = await RetakeService._callApprove(requestIds);
        return { successful, failed };
    },

    /** @internal — зөвшөөрөх API руу хандах дундын дуудлага. */
    _callApprove: async (requestIds: string[]): Promise<{ successful: number; failed: number; results: { requestId: string; ok: boolean; error?: string }[] }> => {
        const res = await fetch("/api/admin/retakes/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestIds }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Зөвшөөрөхөд алдаа гарлаа (${res.status})`);
        return data;
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
