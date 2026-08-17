import { adminDb } from "@/lib/firebase-admin";
import MonitorClient from "./MonitorClient";
import { Exam, UserProfile } from "@/types";

/**
 * Firestore-ийн `Timestamp` нь класс тул Server Component-оос Client Component
 * руу шууд дамжуулж болдоггүй ("Only plain objects ... can be passed" алдаа).
 * Тиймээс гүнзгийрүүлэн `Date` болгож хувиргана — Date нь дамжуулахад зөвшөөрөгдсөн.
 */
function toPlain<T>(value: T): T {
    if (value === null || value === undefined) return value;
    const v = value as unknown as { toDate?: () => Date };
    if (typeof v.toDate === "function") return v.toDate() as unknown as T;
    if (Array.isArray(value)) return value.map(toPlain) as unknown as T;
    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(value as Record<string, unknown>)) {
            if (val === undefined) continue; // undefined-ийг ч дамжуулж болохгүй
            out[k] = toPlain(val);
        }
        return out as unknown as T;
    }
    return value;
}

export default async function MonitorExamPage({ params }: { params: Promise<{ examId: string }> }) {
    const { examId } = await params;

    // Fetch exam info
    const examDoc = await adminDb.collection("exams").doc(examId).get();
    if (!examDoc.exists) {
        return <div className="p-8 text-center text-red-500">Шалгалт олдсонгүй (Exam not found)</div>;
    }

    const examData = toPlain({ id: examDoc.id, ...examDoc.data() }) as Exam;

    // Only fetch users who are registered for this exam (not all users)
    const regsSnap = await adminDb.collection("registrations")
        .where("examId", "==", examId)
        .get();
    const studentIds = [...new Set(regsSnap.docs.map(d => d.data().studentId as string))];
    const usersMap: Record<string, UserProfile> = {};
    if (studentIds.length > 0) {
        const userRefs = studentIds.map(id => adminDb.collection("users").doc(id));
        const userDocs = await adminDb.getAll(...userRefs);
        userDocs.forEach(d => {
            if (d.exists) usersMap[d.id] = toPlain(d.data()) as UserProfile;
        });
    }

    return <MonitorClient examId={examId} exam={examData} usersMap={usersMap} />;
}
