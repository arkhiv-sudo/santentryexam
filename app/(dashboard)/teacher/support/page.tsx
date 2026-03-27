"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { ExamTicket, ExamMessage } from "@/types";
import { Card } from "@/components/ui/Card";
import { MessageSquare, Headset, CheckCircle } from "lucide-react";
import { TicketService } from "@/lib/services/ticket-service";
import { toast } from "sonner";

export default function TeacherSupportPage() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();

    const [tickets, setTickets] = useState<ExamTicket[]>([]);
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [replyMessage, setReplyMessage] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && profile?.role !== "teacher") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    // Listen to forwarded tickets for exams this teacher created
    useEffect(() => {
        if (!profile?.uid) return;

        const setupListener = async () => {
            try {
                // 1. Fetch exams created by this teacher
                const examsQ = query(collection(db, "exams"), where("createdBy", "==", profile.uid));
                const examsSnap = await getDocs(examsQ);
                const teacherExamIds = examsSnap.docs.map(d => d.id);

                if (teacherExamIds.length === 0) {
                    setLoading(false);
                    return; // No exams, no tickets
                }

                // 2. Listen to tickets that are forwarded
                const q = query(
                    collection(db, "exam_tickets"), 
                    where("status", "==", "forwarded_to_teacher")
                );

                const unsubscribe = onSnapshot(q, (snapshot) => {
                    const t: ExamTicket[] = [];
                    snapshot.forEach(doc => {
                        const data = { id: doc.id, ...doc.data() } as ExamTicket;
                        if (teacherExamIds.includes(data.examId)) {
                            t.push(data);
                        }
                    });
                    
                    t.sort((a, b) => {
                        const aTime = a.updatedAt ? (a.updatedAt as unknown as { seconds: number }).seconds : 0;
                        const bTime = b.updatedAt ? (b.updatedAt as unknown as { seconds: number }).seconds : 0;
                        return bTime - aTime;
                    });
                    
                    setTickets(t);
                    setLoading(false);
                }, (err) => {
                    console.error("Error listening to tickets", err);
                    setLoading(false);
                });

                return unsubscribe;
            } catch (err) {
                console.error("Failed to setup listener", err);
                setLoading(false);
            }
        };

        const cleanupPromise = setupListener();
        return () => {
            cleanupPromise.then(unsub => {
                if (typeof unsub === 'function') unsub();
            }).catch(() => {});
        };
    }, [profile?.uid]);

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyMessage.trim() || !selectedTicketId) return;
        try {
            const teacherName = profile?.lastName && profile?.firstName 
                ? `${profile.lastName.charAt(0)}.${profile.firstName}` 
                : "Багш";
            
            await TicketService.addMessage(selectedTicketId, profile!.uid, "teacher", teacherName, replyMessage.trim());
            setReplyMessage("");
        } catch (error) {
            console.error("Could not send reply", error);
            toast.error("Хариу илгээхэд алдаа гарлаа.");
        }
    };

    const handleResolve = async (ticketId: string) => {
        try {
            await TicketService.updateStatus(ticketId, "resolved");
            if (selectedTicketId === ticketId) setSelectedTicketId(null);
            toast.success("Асуудал шийдвэрлэгдлээ.");
        } catch (error) {
            console.error("Could not resolve", error);
            toast.error("Шийдвэрлэхэд алдаа гарлаа.");
        }
    };

    if (authLoading || loading) return <div className="p-8 text-center">Уншиж байна...</div>;

    const selectedTicket = tickets.find(t => t.id === selectedTicketId);

    return (
        <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl bg-linear-to-r from-slate-50 to-blue-50/50 px-6 py-5 border border-slate-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white text-blue-600 rounded-xl shadow-sm border border-slate-100">
                        <Headset className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Сурагчдын тусламж</h1>
                        <p className="text-slate-500 mt-1 text-sm">Админаас шилжиж ирсэн асуултууд</p>
                    </div>
                </div>
                <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className="text-sm font-semibold text-slate-500">Шийдвэрлээгүй:</div>
                    <div className="text-xl font-bold text-amber-600">
                        {tickets.filter(t => t.status !== 'resolved').length}
                    </div>
                </div>
            </div>

            <Card className="border-0 shadow-lg h-[600px] flex overflow-hidden">
                <div className="w-1/3 border-r border-slate-100 flex flex-col bg-slate-50">
                    <div className="flex-1 overflow-y-auto">
                        {tickets.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-sm">Одоогоор шилжиж ирсэн асуулт алга байна.</div>
                        ) : (
                            tickets.map(t => (
                                <button 
                                    key={t.id} 
                                    onClick={() => setSelectedTicketId(t.id)}
                                    className={`w-full text-left p-4 hover:bg-white border-b border-slate-100 transition-colors ${selectedTicketId === t.id ? "bg-white border-l-4 border-l-blue-500" : "border-l-4 border-l-transparent"}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="font-semibold text-sm text-slate-900 truncate">
                                            {t.studentName}
                                        </p>
                                        <span className="text-[10px] text-slate-400">
                                            {/* @ts-expect-error Typescript rigid Firebase Timestamp toDate issue */}
                                            {t.updatedAt?.toDate?.()?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 truncate mt-1">
                                        {t.messages[t.messages.length - 1]?.content || "..."}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </div>
                
                <div className="w-2/3 flex flex-col bg-white">
                    {selectedTicket ? (
                        <>
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white shadow-sm z-10">
                                <h3 className="font-bold text-slate-800">{selectedTicket.studentName}</h3>
                                <button 
                                    onClick={() => handleResolve(selectedTicket.id)}
                                    className="flex items-center gap-2 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 font-bold transition-colors"
                                >
                                    <CheckCircle className="w-4 h-4" /> Шийдвэрлэсэн
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                                {selectedTicket.messages.map((m: ExamMessage) => {
                                    const isAdmin = m.senderRole === "admin";
                                    const isTeacher = m.senderRole === "teacher";
                                    return (
                                        <div key={m.id} className={`flex flex-col ${isAdmin || isTeacher ? "items-end" : "items-start"}`}>
                                            <div className="text-[10px] text-slate-500 mb-1 px-1">
                                                {m.senderName} ({isAdmin ? "Админ" : isTeacher ? "Би" : "Сурагч"})
                                            </div>
                                            <div className={`px-4 py-2 rounded-2xl max-w-[70%] text-sm ${isTeacher ? "bg-amber-500 text-white rounded-tr-sm" : isAdmin ? "bg-blue-600 text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"}`}>
                                                {m.content}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <form onSubmit={handleReply} className="p-4 bg-white border-t border-slate-100 flex gap-2">
                                <input 
                                    type="text" 
                                    value={replyMessage}
                                    onChange={(e) => setReplyMessage(e.target.value)}
                                    placeholder="Хариу бичих..."
                                    className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                                <button 
                                    type="submit" 
                                    disabled={!replyMessage.trim()}
                                    className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold disabled:opacity-50 transition-colors"
                                >
                                    Илгээх
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                            <MessageSquare className="w-12 h-12 text-slate-200" />
                            <p>Тусламж хүссэн сурагчдын жагсаалтаас сонгоно уу</p>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
