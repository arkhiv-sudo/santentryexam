import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MessageSquare, X, Send } from "lucide-react";
import { TicketService } from "@/lib/services/ticket-service";
import { ExamTicket } from "@/types";
import { toast } from "sonner";

interface Props {
    examId: string;
    studentId: string;
    studentName: string;
}

export default function ExamSupportChat({ examId, studentId, studentName }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [ticket, setTicket] = useState<ExamTicket | null>(null);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Listen for the student's ticket
    useEffect(() => {
        const q = query(
            collection(db, "exam_tickets"),
            where("examId", "==", examId),
            where("studentId", "==", studentId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                setTicket({ id: doc.id, ...doc.data() } as ExamTicket);
                // scroll to bottom timeout to let DOM render
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            }
        });

        return () => unsubscribe();
    }, [examId, studentId]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || loading) return;
        setLoading(true);

        try {
            if (!ticket) {
                await TicketService.createTicket(examId, studentId, studentName, message.trim());
            } else {
                await TicketService.addMessage(ticket.id, studentId, "student", studentName, message.trim());
            }
            setMessage("");
        } catch (error) {
            console.error("Failed to send message:", error);
            toast.error("Зурвас илгээхэд алдаа гарлаа. Дахин оролдоно уу.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {isOpen ? (
                <div className="w-80 md:w-96 h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-5">
                    {/* Header */}
                    <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold">Тусламж</h3>
                            <p className="text-blue-100 text-xs">Админ / Багштай холбогдох</p>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-blue-200 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                        {ticket ? (
                            ticket.messages.map((m) => {
                                const isMe = m.senderId === studentId;
                                return (
                                    <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                                        <div className={`text-[10px] text-slate-500 mb-1 px-1`}>
                                            {m.senderName} ({m.senderRole === "admin" ? "Админ" : m.senderRole === "teacher" ? "Багш" : "Би"})
                                        </div>
                                        <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${isMe ? "bg-blue-600 text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"}`}>
                                            {m.content}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                <MessageSquare className="w-12 h-12 text-slate-300 mb-2" />
                                <p className="text-slate-500 text-sm">Шалгалтын талаар асуух зүйл гарвал энд бичнэ үү.</p>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex gap-2">
                        <input
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Зурвас бичих..."
                            className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                        <button 
                            type="submit" 
                            disabled={!message.trim() || loading}
                            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 transition-colors"
                        >
                            <Send className="w-5 h-5 -ml-0.5" />
                        </button>
                    </form>
                </div>
            ) : (
                <button 
                    onClick={() => setIsOpen(true)}
                    className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105"
                >
                    <MessageSquare className="w-6 h-6" />
                </button>
            )}
        </div>
    );
}
