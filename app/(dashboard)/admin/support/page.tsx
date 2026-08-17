"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { ExamTicket } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TicketService } from "@/lib/services/ticket-service";
import { playChime, useInboxSound } from "@/hooks/useAdminInbox";
import { toast } from "sonner";
import { Headset, Send, CheckCircle, Forward, Bell, BellOff, MessageSquare } from "lucide-react";

type Filter = "open" | "forwarded_to_teacher" | "resolved";

const FILTERS: { key: Filter; label: string }[] = [
    { key: "open", label: "Шинэ" },
    { key: "forwarded_to_teacher", label: "Багшид дамжуулсан" },
    { key: "resolved", label: "Шийдэгдсэн" },
];

function toMillis(value: unknown): number {
    const v = value as { seconds?: number } | undefined;
    if (v?.seconds) return v.seconds * 1000;
    const d = new Date(value as string);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Админы тусламжийн чат — шалгалтын үед сурагчаас ирсэн хүсэлтүүд.
 *
 * Сурагчийн шалгалтын хуудсан дээрх чат `exam_tickets`-д бичдэг ба анхны
 * төлөв нь `open` (админ хариулна). Багшийн `/teacher/support` хуудас зөвхөн
 * `forwarded_to_teacher` төлөвтэйг хардаг тул админ энэ хуудсаар дамжуулан
 * эхний шатны хариултыг өгнө.
 */
export default function AdminSupportPage() {
    const { profile } = useAuth();
    const [tickets, setTickets] = useState<ExamTicket[]>([]);
    const [filter, setFilter] = useState<Filter>("open");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [reply, setReply] = useState("");
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const { muted, toggleMuted } = useInboxSound();
    const seen = useRef<Set<string> | null>(null);

    useEffect(() => {
        const unsub = onSnapshot(
            query(collection(db, "exam_tickets"), where("status", "==", filter)),
            snap => {
                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }) as ExamTicket);
                rows.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));

                if (filter === "open") {
                    const prev = seen.current;
                    if (prev && rows.some(r => !prev.has(r.id))) {
                        toast.warning("Шинэ тусламжийн хүсэлт ирлээ");
                        if (!muted) playChime();
                    }
                    seen.current = new Set(rows.map(r => r.id));
                }

                setTickets(rows);
                setLoading(false);
            },
            err => { console.error("[admin/support]", err); setLoading(false); },
        );
        return () => unsub();
    }, [filter, muted]);

    const selected = useMemo(
        () => tickets.find(t => t.id === selectedId) ?? null,
        [tickets, selectedId],
    );

    const adminName = profile?.lastName && profile?.firstName
        ? `${profile.lastName.charAt(0)}.${profile.firstName}`
        : "Админ";

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reply.trim() || !selected || !profile) return;
        setSending(true);
        try {
            await TicketService.addMessage(selected.id, profile.uid, "admin", adminName, reply.trim());
            setReply("");
        } catch (err) {
            console.error(err);
            toast.error("Хариу илгээхэд алдаа гарлаа");
        } finally {
            setSending(false);
        }
    };

    const setStatus = async (status: ExamTicket["status"], label: string) => {
        if (!selected) return;
        try {
            await TicketService.updateStatus(selected.id, status);
            toast.success(label);
            setSelectedId(null);
        } catch (err) {
            console.error(err);
            toast.error("Төлөв өөрчлөхөд алдаа гарлаа");
        }
    };

    return (
        <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl bg-linear-to-r from-slate-50 to-indigo-50/50 px-6 py-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Headset className="w-5 h-5 text-indigo-600" /> Тусламж
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        Шалгалтын үед сурагчаас шууд ирсэн хүсэлтүүд — бодит хугацаанд
                    </p>
                </div>
                <button
                    onClick={toggleMuted}
                    className="text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-white border border-slate-200"
                    title={muted ? "Дуут дохиог асаах" : "Дуут дохиог унтраах"}
                >
                    {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                {FILTERS.map(f => (
                    <button
                        key={f.key}
                        onClick={() => { setFilter(f.key); setSelectedId(null); }}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors border-2 ${
                            filter === f.key
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                        }`}
                    >
                        {f.label}
                        {filter === f.key && tickets.length > 0 && (
                            <span className="ml-2 text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full">{tickets.length}</span>
                        )}
                    </button>
                ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Жагсаалт */}
                <Card className="border-0 shadow-lg lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-base">Хүсэлтүүд ({tickets.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[32rem] overflow-y-auto">
                        {loading ? (
                            <p className="p-6 text-center text-slate-500">Уншиж байна...</p>
                        ) : tickets.length === 0 ? (
                            <p className="p-6 text-center text-slate-500">Хүсэлт алга байна</p>
                        ) : (
                            tickets.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedId(t.id)}
                                    className={`w-full text-left p-4 border-b border-slate-100 transition-colors ${
                                        selectedId === t.id ? "bg-indigo-50 border-l-4 border-l-indigo-500" : "hover:bg-slate-50 border-l-4 border-l-transparent"
                                    }`}
                                >
                                    <p className="font-bold text-slate-900">{t.studentName || t.studentId}</p>
                                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" />
                                        {t.messages?.length ?? 0} мессеж
                                    </p>
                                    <p className="text-sm text-slate-600 truncate mt-1">
                                        {t.messages?.[t.messages.length - 1]?.content || ""}
                                    </p>
                                </button>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Чат */}
                <Card className="border-0 shadow-lg lg:col-span-2">
                    {!selected ? (
                        <CardContent className="p-12 text-center text-slate-500">
                            Зүүн талаас хүсэлт сонгоно уу
                        </CardContent>
                    ) : (
                        <>
                            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100">
                                <CardTitle className="text-base">{selected.studentName || selected.studentId}</CardTitle>
                                <div className="flex flex-wrap gap-2">
                                    {selected.status !== "forwarded_to_teacher" && (
                                        <Button
                                            variant="outline" size="sm"
                                            onClick={() => setStatus("forwarded_to_teacher", "Багшид дамжууллаа")}
                                            className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                                        >
                                            <Forward className="w-3.5 h-3.5" /> Багшид дамжуулах
                                        </Button>
                                    )}
                                    {selected.status !== "resolved" && (
                                        <Button
                                            size="sm"
                                            onClick={() => setStatus("resolved", "Шийдэгдсэн гэж тэмдэглэлээ")}
                                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5" /> Шийдэгдсэн
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>

                            <CardContent className="p-4 space-y-3">
                                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                                    {(selected.messages || []).map(m => (
                                        <div
                                            key={m.id}
                                            className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                                                m.senderRole === "student"
                                                    ? "bg-slate-100 text-slate-800"
                                                    : "bg-indigo-600 text-white ml-auto"
                                            }`}
                                        >
                                            <p className="text-[10px] font-bold opacity-70 mb-0.5">
                                                {m.senderName} · {m.senderRole === "student" ? "сурагч" : m.senderRole === "admin" ? "админ" : "багш"}
                                            </p>
                                            <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                                        </div>
                                    ))}
                                </div>

                                <form onSubmit={handleReply} className="flex gap-2 pt-2 border-t border-slate-100">
                                    <Input
                                        value={reply}
                                        onChange={e => setReply(e.target.value)}
                                        placeholder="Хариу бичих..."
                                        className="flex-1"
                                        maxLength={500}
                                    />
                                    <Button
                                        type="submit"
                                        disabled={sending || !reply.trim()}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                                    >
                                        <Send className="w-4 h-4" /> Илгээх
                                    </Button>
                                </form>
                            </CardContent>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
