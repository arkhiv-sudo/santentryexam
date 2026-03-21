import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    getCountFromServer,
    DocumentData,
    QueryDocumentSnapshot,
    QueryConstraint,
    writeBatch
} from "firebase/firestore";
import { Question, QuestionType, UserRole, UserProfile } from "@/types";

const COLLECTION_NAME = "questions";

/**
 * Strips undefined fields from an object to prevent Firestore errors.
 */
function cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result = { ...obj };
    Object.keys(result).forEach(key => {
        if (result[key] === undefined) {
            delete result[key];
        }
    });
    return result;
}

export const QuestionService = {
    getAllQuestions: async (): Promise<Question[]> => {
        try {
            // Remove orderBy to ensure legacy questions without createdAt are included
            const q = query(collection(db, COLLECTION_NAME));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Question));
        } catch (error) {
            console.error("Error fetching questions:", error);
            throw error;
        }
    },

    getQuestionsPaginated: async (
        pageSize: number,
        lastDoc?: QueryDocumentSnapshot<DocumentData>,
        type?: QuestionType | "all",
        subject?: string | "all",
        grade?: string | "all",
        createdBy?: string | "all"
    ): Promise<{ questions: Question[], lastVisible: QueryDocumentSnapshot<DocumentData> | null, totalCount: number }> => {
        try {
            const constraints: QueryConstraint[] = [];

            if (type && type !== "all") {
                constraints.push(where("type", "==", type));
            }

            if (subject && subject !== "all") {
                constraints.push(where("subject", "==", subject));
            }

            if (grade && grade !== "all") {
                constraints.push(where("grade", "==", grade));
            }

            if (createdBy && createdBy !== "all") {
                constraints.push(where("createdBy", "==", createdBy));
            }

            // We use createdAt as primary sort key
            // This requires composite indexes for any field used in 'where'
            constraints.push(orderBy("createdAt", "desc"));
            constraints.push(orderBy("__name__", "desc")); // Stable sort tie-breaker

            // Snapshot the base constraints BEFORE adding pagination-specific ones,
            // so totalCount is not affected by startAfter / limit.
            const baseConstraints = [...constraints];
            const totalCountQuery = query(collection(db, COLLECTION_NAME), ...baseConstraints);
            const totalSnapshot = await getCountFromServer(totalCountQuery);
            const totalCount = totalSnapshot.data().count;

            const pageConstraints = [...baseConstraints];
            if (lastDoc) {
                pageConstraints.push(startAfter(lastDoc));
            }
            pageConstraints.push(limit(pageSize));

            const q = query(collection(db, COLLECTION_NAME), ...pageConstraints);
            const snapshot = await getDocs(q);

            const questions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Question));

            const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

            return { questions, lastVisible, totalCount };
        } catch (error) {
            console.error("Error fetching paginated questions:", error);
            throw error;
        }
    },

    getQuestionsByFilters: async (subject?: string, type?: QuestionType): Promise<Question[]> => {
        try {
            const constraints: QueryConstraint[] = [];
            if (subject) constraints.push(where("subject", "==", subject));
            if (type) constraints.push(where("type", "==", type));

            const q = query(collection(db, COLLECTION_NAME), ...constraints);
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Question));
        } catch (error) {
            console.error("Error fetching filtered questions:", error);
            throw error;
        }
    },

    createQuestion: async (question: Omit<Question, "id">): Promise<string> => {
        try {
            const now = new Date().toISOString();
            const cleaned = cleanObject({
                ...question,
                createdAt: now,
                updatedAt: now
            });
            const docRef = await addDoc(collection(db, COLLECTION_NAME), cleaned);
            return docRef.id;
        } catch (error) {
            console.error("Error creating question:", error);
            throw error;
        }
    },

    createQuestionsBatch: async (questions: Omit<Question, "id">[]): Promise<void> => {
        try {
            const questionsRef = collection(db, COLLECTION_NAME);
            
            for (let i = 0; i < questions.length; i += 500) {
                const chunk = questions.slice(i, i + 500);
                const batch = writeBatch(db);
                
                chunk.forEach(q => {
                    const newDocRef = doc(questionsRef);
                    batch.set(newDocRef, cleanObject({
                        ...q,
                        createdAt: q.createdAt || new Date().toISOString(), // Ensure createdAt is string
                        updatedAt: new Date().toISOString()
                    }));
                });
                
                await batch.commit();
            }
        } catch (error) {
            console.error("Error batch creating questions:", error);
            throw error;
        }
    },

    updateQuestion: async (id: string, updates: Partial<Question>): Promise<void> => {
        try {
            const docRef = doc(db, COLLECTION_NAME, id);
            const cleaned = cleanObject({
                ...updates,
                updatedAt: new Date().toISOString()
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await updateDoc(docRef, cleaned as any);
        } catch (error) {
            console.error("Error updating question:", error);
            throw error;
        }
    },

    deleteQuestion: async (id: string): Promise<void> => {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, id));
        } catch (error) {
            console.error("Error deleting question:", error);
            throw error;
        }
    },

    bulkDeleteQuestions: async (ids: string[]): Promise<void> => {
        try {
            // Firestore batches allow up to 500 operations.
            const chunks = [];
            for (let i = 0; i < ids.length; i += 500) {
                chunks.push(ids.slice(i, i + 500));
            }

            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(id => {
                    batch.delete(doc(db, COLLECTION_NAME, id));
                });
                await batch.commit();
            }
        } catch (error) {
            console.error("Error bulk deleting questions:", error);
            throw error;
        }
    },

    deleteAllMatchingQuestions: async (
        type?: QuestionType | "all",
        subject?: string | "all",
        grade?: string | "all",
        createdBy?: string | "all"
    ): Promise<number> => {
        try {
            const constraints: QueryConstraint[] = [];
            if (type && type !== "all") constraints.push(where("type", "==", type));
            if (subject && subject !== "all") constraints.push(where("subject", "==", subject));
            if (grade && grade !== "all") constraints.push(where("grade", "==", grade));
            if (createdBy && createdBy !== "all") constraints.push(where("createdBy", "==", createdBy));

            const q = query(collection(db, COLLECTION_NAME), ...constraints);
            const snapshot = await getDocs(q);
            const ids = snapshot.docs.map(doc => doc.id);

            await QuestionService.bulkDeleteQuestions(ids);
            return ids.length;
        } catch (error) {
            console.error("Error deleting all matching questions:", error);
            throw error;
        }
    },


    /**
     * Common: Fetch users by specific roles (e.g., admin, teacher)
     */
    getUsersByRoles: async (roles: UserRole[]): Promise<UserProfile[]> => {
        try {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("role", "in", roles));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        } catch (error) {
            console.error("Error fetching users by roles:", error);
            return [];
        }
    },

    /**
     * Fetch question counts for specific grade and subjects
     */
    getQuestionCounts: async (grade: string, subjectIds: string[]): Promise<Record<string, number>> => {
        try {
            const counts: Record<string, number> = {};

            // For now, we fetch each count individually as Firestore doesn't support GROUP BY easily
            // We use Promise.all for parallelism
            await Promise.all(subjectIds.map(async (subjectId) => {
                const q = query(
                    collection(db, COLLECTION_NAME),
                    where("grade", "==", grade),
                    where("subject", "==", subjectId)
                );
                const snapshot = await getCountFromServer(q);
                counts[subjectId] = snapshot.data().count;
            }));

            return counts;
        } catch (error) {
            console.error("Error fetching question counts:", error);
            return {};
        }
    }
};
