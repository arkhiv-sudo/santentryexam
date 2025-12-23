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
    DocumentData
} from "firebase/firestore";
import { Question, QuestionType } from "@/types";

const COLLECTION_NAME = "questions";

export const QuestionService = {
    getAllQuestions: async (): Promise<Question[]> => {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy("category"));
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
            const docRef = await addDoc(collection(db, COLLECTION_NAME), question);
            return docRef.id;
        } catch (error) {
            console.error("Error creating question:", error);
            throw error;
        }
    },

    updateQuestion: async (id: string, updates: Partial<Question>): Promise<void> => {
        try {
            const docRef = doc(db, COLLECTION_NAME, id);
            await updateDoc(docRef, updates);
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
    }
};
