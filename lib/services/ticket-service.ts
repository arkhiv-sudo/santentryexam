import { db } from "../firebase";
import { collection, doc, addDoc, updateDoc, query, where, getDocs, serverTimestamp, arrayUnion } from "firebase/firestore";
import { ExamTicket, ExamMessage } from "@/types";

const TICKETS = "exam_tickets";

export const TicketService = {
    async createTicket(examId: string, studentId: string, studentName: string, initialMessageContent: string): Promise<string> {
        const ticketRef = await addDoc(collection(db, TICKETS), {
            examId,
            studentId,
            studentName,
            status: 'open',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            messages: [{
                id: crypto.randomUUID(),
                senderId: studentId,
                senderRole: 'student',
                senderName: studentName,
                content: initialMessageContent,
                createdAt: new Date().toISOString() // consistent ISO string, same as addMessage
            }]
        });
        return ticketRef.id;
    },

    async addMessage(ticketId: string, senderId: string, senderRole: 'student' | 'admin' | 'teacher', senderName: string, content: string) {
        const message: ExamMessage = {
            id: crypto.randomUUID(),
            senderId,
            senderRole,
            senderName,
            content,
            // @ts-expect-error Firebase timestamp usage in arrayUnion is tricky; using ISO string for consistency
            createdAt: new Date().toISOString()
        };

        const ticketRef = doc(db, TICKETS, ticketId);
        await updateDoc(ticketRef, {
            messages: arrayUnion(message),
            updatedAt: serverTimestamp()
        });
    },

    async updateStatus(ticketId: string, status: ExamTicket['status']) {
        const ticketRef = doc(db, TICKETS, ticketId);
        await updateDoc(ticketRef, {
            status,
            updatedAt: serverTimestamp()
        });
    },

    async getTicketsByExam(examId: string): Promise<ExamTicket[]> {
        const q = query(collection(db, TICKETS), where("examId", "==", examId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ExamTicket);
    }
};
