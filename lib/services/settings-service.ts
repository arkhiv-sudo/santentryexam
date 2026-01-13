import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    where,
    writeBatch
} from "firebase/firestore";
import { Grade, Subject } from "@/types";

export const SettingsService = {
    // Grade management (Hardcoded 1-12)
    getGrades: async (): Promise<Grade[]> => {
        return Array.from({ length: 12 }, (_, i) => ({
            id: `${i + 1}`,
            name: `${i + 1}-р анги`,
            order: i + 1
        }));
    },

    // Subject management
    _subjectsCache: null as Subject[] | null,
    getSubjects: async (gradeId?: string): Promise<Subject[]> => {
        try {
            if (SettingsService._subjectsCache && !gradeId) {
                return SettingsService._subjectsCache;
            }

            let q = query(collection(db, "subjects"), orderBy("name", "asc"));
            if (gradeId) {
                q = query(collection(db, "subjects"), where("gradeId", "==", gradeId), orderBy("name", "asc"));
            }
            const snapshot = await getDocs(q);
            const subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject));

            if (!gradeId) {
                SettingsService._subjectsCache = subjects;
            }
            return subjects;
        } catch (error) {
            console.error("Error fetching subjects:", error);
            throw error;
        }
    },

    createSubject: async (name: string, gradeId?: string): Promise<string> => {
        const data: any = { name };
        if (gradeId) data.gradeId = gradeId;
        const docRef = await addDoc(collection(db, "subjects"), data);
        return docRef.id;
    },

    createSubjectsBatch: async (subjects: { name: string, gradeId: string }[]): Promise<void> => {
        const batch = writeBatch(db);
        const subjectsRef = collection(db, "subjects");

        subjects.forEach(s => {
            const newDocRef = doc(subjectsRef);
            batch.set(newDocRef, { name: s.name, gradeId: s.gradeId });
        });

        await batch.commit();
    },

    deleteSubject: async (id: string): Promise<void> => {
        await deleteDoc(doc(db, "subjects", id));
    }
};
