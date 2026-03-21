import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    where,
    writeBatch
} from "firebase/firestore";
import { Grade, Subject, Lesson } from "@/types";

export const SettingsService = {
    // Grade management (Hardcoded 1-12)
    getGrades: async (): Promise<Grade[]> => {
        return Array.from({ length: 12 }, (_, i) => ({
            id: `${i + 1}`,
            name: `${i + 1}-р анги`,
            order: i + 1
        }));
    },

    // Lesson management (Хичээл)
    _lessonsCache: null as Lesson[] | null,
    getLessons: async (): Promise<Lesson[]> => {
        if (SettingsService._lessonsCache) return SettingsService._lessonsCache;
        const snapshot = await getDocs(query(collection(db, "lessons"), orderBy("name", "asc")));
        const lessons = snapshot.docs.map(d => ({ id: d.id, name: d.data().name } as Lesson));
        SettingsService._lessonsCache = lessons;
        return lessons;
    },

    createLesson: async (name: string): Promise<string> => {
        const normalized = name.trim();
        const docRef = await addDoc(collection(db, "lessons"), { name: normalized });
        SettingsService._lessonsCache = null;
        return docRef.id;
    },

    deleteLesson: async (id: string): Promise<void> => {
        await deleteDoc(doc(db, "lessons", id));
        SettingsService._lessonsCache = null;
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

    createSubject: async (name: string, gradeId?: string, lessonId?: string): Promise<string> => {
        const data: Record<string, string> = { name: name.trim() };
        if (gradeId) data.gradeId = gradeId;
        if (lessonId) data.lessonId = lessonId;
        const docRef = await addDoc(collection(db, "subjects"), data);
        SettingsService._subjectsCache = null; // invalidate cache
        return docRef.id;
    },

    createSubjectsBatch: async (subjects: { name: string, gradeId: string, lessonId?: string }[]): Promise<void> => {
        SettingsService._subjectsCache = null;
        const subjectsRef = collection(db, "subjects");
        for (let i = 0; i < subjects.length; i += 500) {
            const chunk = subjects.slice(i, i + 500);
            const batch = writeBatch(db);
            chunk.forEach(s => {
                const newDocRef = doc(subjectsRef);
                const data: Record<string, string> = { name: s.name.trim(), gradeId: s.gradeId };
                if (s.lessonId) data.lessonId = s.lessonId;
                batch.set(newDocRef, data);
            });
            await batch.commit();
        }
    },

    deleteSubjectsBatch: async (ids: string[]): Promise<void> => {
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const batch = writeBatch(db);
            chunk.forEach(id => {
                const docRef = doc(db, "subjects", id);
                batch.delete(docRef);
            });
            await batch.commit();
        }
    },

    deleteSubject: async (id: string): Promise<void> => {
        await deleteDoc(doc(db, "subjects", id));
    }
};
