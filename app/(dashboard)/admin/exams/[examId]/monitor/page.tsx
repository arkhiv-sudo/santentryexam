import { adminDb } from "@/lib/firebase-admin";
import MonitorClient from "./MonitorClient";
import { Exam, UserProfile } from "@/types";

export default async function MonitorExamPage({ params }: { params: Promise<{ examId: string }> }) {
    const { examId } = await params;

    // Fetch exam info
    const examDoc = await adminDb.collection("exams").doc(examId).get();
    if (!examDoc.exists) {
        return <div className="p-8 text-center text-red-500">Шалгалт олдсонгүй (Exam not found)</div>;
    }

    const examData = { id: examDoc.id, ...examDoc.data() } as Exam;

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
            if (d.exists) usersMap[d.id] = d.data() as UserProfile;
        });
    }

    return <MonitorClient examId={examId} exam={examData} usersMap={usersMap} />;
}
