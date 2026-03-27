import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    where
} from "firebase/firestore";

const ARCHIVES = "archived_exams";
const EXAMS = "exams";
const SUBMISSIONS = "submissions";
const REGISTRATIONS = "registrations";
const EXAM_RESULTS = "exam_results";

export const ArchiveService = {
    archiveExam: async (examId: string): Promise<void> => {
        // 1. Fetch Exam
        const examSnap = await getDoc(doc(db, EXAMS, examId));
        if (!examSnap.exists()) {
            throw new Error(`Exam ${examId} not found`);
        }
        const examData = examSnap.data();

        // 2. Fetch related data
        const getColDocs = async (col: string, field: string = "examId") => {
            const snap = await getDocs(query(collection(db, col), where(field, "==", examId)));
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        };

        const submissions = await getColDocs(SUBMISSIONS);
        const results = await getColDocs(EXAM_RESULTS);
        const registrations = await getColDocs(REGISTRATIONS);

        // 3. Assemble archive document
        const archiveData = {
            id: examId,
            exam: examData,
            submissions,
            results,
            registrations,
            archivedAt: new Date()
        };

        // 4. Save to archived_exams
        await setDoc(doc(db, ARCHIVES, examId), archiveData);

        // 5. Delete original exam. 
        // This will trigger the Cloud Function `onExamDelete` which cleans up 
        // original registrations, submissions, and exam_results to keep the database clean.
        await deleteDoc(doc(db, EXAMS, examId));
    },

    getArchivedExams: async () => {
        const snap = await getDocs(collection(db, ARCHIVES));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    getArchivedExamById: async (id: string) => {
        const snap = await getDoc(doc(db, ARCHIVES, id));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    },

    deleteArchive: async (id: string): Promise<void> => {
        await deleteDoc(doc(db, ARCHIVES, id));
    }
};
