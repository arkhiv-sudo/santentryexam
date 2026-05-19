import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp
} from "firebase/firestore";

const ARCHIVES = "archived_exams";
const EXAMS = "exams";
const SUBMISSIONS = "submissions";
const REGISTRATIONS = "registrations";
const EXAM_RESULTS = "exam_results";

export const ArchiveService = {
    /** FIX D3: Semi-atomic "write-archive-first, then-delete-source". The reads
     *  happen in parallel, the archive doc is written before deleting the exam,
     *  and the operation is idempotent on re-run (no data loss if the function is
     *  retried after a partial failure). */
    archiveExam: async (examId: string): Promise<void> => {
        // 1. Read everything (outside any transaction) in parallel
        const examSnap = await getDoc(doc(db, EXAMS, examId));
        if (!examSnap.exists()) {
            throw new Error("Шалгалт олдсонгүй");
        }

        const [regsSnap, subsSnap, resultsSnap] = await Promise.all([
            getDocs(query(collection(db, REGISTRATIONS), where("examId", "==", examId))),
            getDocs(query(collection(db, SUBMISSIONS), where("examId", "==", examId))),
            getDocs(query(collection(db, EXAM_RESULTS), where("examId", "==", examId))),
        ]);

        const archiveData = {
            exam: { id: examSnap.id, ...examSnap.data() },
            registrations: regsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            submissions: subsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            results: resultsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            archivedAt: serverTimestamp(),
        };

        // 2. Write the archive document FIRST. If the next step fails, the
        //    archive is still safely persisted and the call can be retried.
        await setDoc(doc(db, ARCHIVES, examId), archiveData);

        // 3. Delete the exam. The onExamDelete Cloud Function cascades the
        //    deletion of registrations / submissions / exam_results / exam_answers.
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
