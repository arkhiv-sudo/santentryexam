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
    Timestamp,
} from "firebase/firestore";

export interface Announcement {
    id: string;
    title: string;
    content: string;
    imageUrl?: string;
    createdAt: Date;
    createdBy: string;
}

const COLLECTION = "announcements";

export const AnnouncementService = {
    getAll: async (): Promise<Announcement[]> => {
        const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        return snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                title: data.title as string,
                content: data.content as string,
                imageUrl: data.imageUrl as string | undefined,
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
                createdBy: data.createdBy as string,
            };
        });
    },

    create: async (data: Omit<Announcement, "id" | "createdAt">): Promise<string> => {
        const ref = await addDoc(collection(db, COLLECTION), {
            ...data,
            createdAt: Timestamp.now(),
        });
        return ref.id;
    },

    update: async (id: string, data: Partial<Omit<Announcement, "id" | "createdAt">>): Promise<void> => {
        await updateDoc(doc(db, COLLECTION, id), data);
    },

    delete: async (id: string): Promise<void> => {
        await deleteDoc(doc(db, COLLECTION, id));
    },
};
