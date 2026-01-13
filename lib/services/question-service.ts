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
    QueryDocumentSnapshot
} from "firebase/firestore";
import { Question, QuestionType, UserRole, UserProfile } from "@/types";

const COLLECTION_NAME = "questions";

/**
 * Strips undefined fields from an object to prevent Firestore errors.
 */
function cleanObject(obj: any): any {
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
            let constraints: any[] = [];

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

            const totalCountQuery = query(collection(db, COLLECTION_NAME), ...constraints);
            const totalSnapshot = await getCountFromServer(totalCountQuery);
            const totalCount = totalSnapshot.data().count;

            if (lastDoc) {
                constraints.push(startAfter(lastDoc));
            }
            constraints.push(limit(pageSize));

            const q = query(collection(db, COLLECTION_NAME), ...constraints);
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

    getQuestionsByFilters: async (category?: string, type?: QuestionType): Promise<Question[]> => {
        try {
            let constraints = [];
            if (category) constraints.push(where("category", "==", category));
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

    updateQuestion: async (id: string, updates: Partial<Question>): Promise<void> => {
        try {
            const docRef = doc(db, COLLECTION_NAME, id);
            const cleaned = cleanObject({
                ...updates,
                updatedAt: new Date().toISOString()
            });
            await updateDoc(docRef, cleaned);
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

    createQuestionsBatch: async (questions: Omit<Question, "id">[]): Promise<void> => {
        try {
            const promises = questions.map(q => {
                const now = new Date().toISOString();
                const cleaned = cleanObject({
                    ...q,
                    createdAt: now,
                    updatedAt: now
                });
                return addDoc(collection(db, COLLECTION_NAME), cleaned);
            });
            await Promise.all(promises);
        } catch (error) {
            console.error("Error in batch creation:", error);
            throw error;
        }
    },

    /**
     * Migration: Adds createdAt to legacy questions that don't have it.
     */
    migrateLegacyQuestions: async (): Promise<number> => {
        try {
            const q = query(collection(db, COLLECTION_NAME));
            const snapshot = await getDocs(q);
            let count = 0;
            const now = new Date().toISOString();

            for (const document of snapshot.docs) {
                const data = document.data();
                if (!data.createdAt) {
                    const docRef = doc(db, COLLECTION_NAME, document.id);
                    await updateDoc(docRef, {
                        createdAt: now,
                        updatedAt: now
                    });
                    count++;
                }
            }
            return count;
        } catch (error) {
            console.error("Migration failed:", error);
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
            return snapshot.docs.map(doc => doc.data() as UserProfile);
        } catch (error) {
            console.error("Error fetching users by roles:", error);
            return [];
        }
    }
};
