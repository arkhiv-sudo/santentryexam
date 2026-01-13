import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    getDoc, // Added getDoc
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    where
} from "firebase/firestore";
import { Exam } from "@/types";

const COLLECTION_NAME = "exams";

export const ExamService = {
    getAllExams: async (): Promise<Exam[]> => {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy("scheduledAt", "desc"));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Convert Firestore Timestamp to Date if necessary
                    scheduledAt: data.scheduledAt?.toDate ? data.scheduledAt.toDate() : new Date(data.scheduledAt),
                    registrationEndDate: data.registrationEndDate?.toDate ? data.registrationEndDate.toDate() : new Date(data.registrationEndDate)
                } as Exam;
            });
        } catch (error) {
            console.error("Error fetching exams:", error);
            throw error;
        }
    },

    getExamById: async (id: string): Promise<Exam | null> => {
        try {
            const docRef = doc(db, COLLECTION_NAME, id);
            const snapshot = await getDoc(docRef); // Changed to getDoc

            if (!snapshot.exists()) return null; // Corrected check for existence

            const data = snapshot.data();
            return {
                id: snapshot.id, // Corrected to snapshot.id
                ...data,
                scheduledAt: data.scheduledAt?.toDate ? data.scheduledAt.toDate() : new Date(data.scheduledAt),
                registrationEndDate: data.registrationEndDate?.toDate ? data.registrationEndDate.toDate() : new Date(data.registrationEndDate)
            } as Exam;
        } catch (error) {
            console.error("Error fetching exam by id:", error);
            throw error;
        }
    },

    createExam: async (exam: Omit<Exam, "id">): Promise<string> => {
        try {
            const docRef = await addDoc(collection(db, COLLECTION_NAME), exam);
            return docRef.id;
        } catch (error) {
            console.error("Error creating exam:", error);
            throw error;
        }
    },

    updateExam: async (id: string, updates: Partial<Exam>): Promise<void> => {
        try {
            const docRef = doc(db, COLLECTION_NAME, id);
            await updateDoc(docRef, updates);
        } catch (error) {
            console.error("Error updating exam:", error);
            throw error;
        }
    },

    deleteExam: async (id: string): Promise<void> => {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, id));
        } catch (error) {
            console.error("Error deleting exam:", error);
            throw error;
        }
    }
};
