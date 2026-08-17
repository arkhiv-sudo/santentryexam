"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/providers/ModalProvider";
import { RetakeService } from "@/lib/services/retake-service";
import { useAdminInbox, useInboxSound, playChime } from "@/hooks/useAdminInbox";
import {
    BellRing,
    Bell,
    BellOff,
    MessageSquare,
    CheckCircle2,
    XCircle,
    Loader2,
    MonitorPlay,
} from "lucide-react";

/**
 * Админы хянах самбар дээрх «Хүлээгдэж буй хүсэлт» самбар.
 *
 * БҮХ шалгалтын хүсэлтийг нэг дор, бодит хугацаанд харуулна — өмнө нь
 * зөвхөн тухайн шалгалтын явцын хуудсан дээр л харагддаг байсан.
 * Шинэ хүсэлт ирэхэд toast + богино дуут дохио өгнө (дууг унтраах боломжтой).
 */
export default function PendingRequestsPanel() {
    const { retakes, tickets, total, newArrival, clearArrival } = useAdminInbox(true);
    const { muted, toggleMuted } = useInboxSound();
    const confirm = useConfirm();
    const [busyId, setBusyId] = useState<string | null>(null);

    // Шинэ хүсэлт ирэхэд анхааруулах
    useEffect(() => {
        if (!newArrival) return;
        const label = newArrival.kind === "retake"
            ? `${newArrival.name} — дахин өгөх хүсэлт илгээлээ`
            : `${newArrival.name} — тусламж хүсэж байна`;
        toast.warning(label, { duration: 8000 });
        if (!muted) playChime();
        clearArrival();
    }, [newArrival, muted, clearArrival]);

    const handleApprove = async (id: string, name: string) => {
        const ok = await confirm({
            title: "Хүсэлт зөвшөөрөх",
            message: `${name}-д шалгалтаа дахин өгөх боломж олгох уу? Хуучин хариулт, дүн нь устаж, шалгалт руу дахин орно.`,
            confirmLabel: "Зөвшөөрөх",
        });
        if (!ok) return;
        setBusyId(id);
        try {
            await RetakeService.approveRequest(id);
            toast.success(`${name} — зөвшөөрлөө`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Зөвшөөрөхөд алдаа гарлаа");
        } finally {
            setBusyId(null);
        }
    };

    const handleReject = async (id: string, studentId: string, name: string) => {
        const ok = await confirm({
            title: "Хүсэлт татгалзах",
            message: `${name}-ийн хүсэлтийг татгалзах уу?`,
            variant: "destructive",
            confirmLabel: "Татгалзах",
        });
        if (!ok) return;
        setBusyId(id);
        try {
            await RetakeService.rejectRequest(id, studentId);
            toast.success("Татгалзлаа");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
        } finally {
            setBusyId(null);
        }
    };

    if (total === 0) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-slate-500">
                        <Bell className="w-5 h-5 text-slate-300" />
                        <span className="font-medium">Хүлээгдэж буй хүсэлт алга байна</span>
                    </div>
                    <button
                        onClick={toggleMuted}
                        className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100"
                        title={muted ? "Дуут дохиог асаах" : "Дуут дохиог унтраах"}
                    >
                        {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    </button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-0 shadow-xl ring-2 ring-amber-300">
            <CardHeader className="flex flex-row items-center justify-between gap-4 bg-linear-to-r from-amber-50 to-orange-50 rounded-t-xl">
                <CardTitle className="flex items-center gap-2 text-amber-900">
                    <BellRing className="w-5 h-5 text-amber-600 animate-pulse" />
                    Хүлээгдэж буй хүсэлт
                    <span className="text-xs font-black bg-amber-500 text-white px-2.5 py-1 rounded-full">
                        {total}
                    </span>
                </CardTitle>
                <button
                    onClick={toggleMuted}
                    className="text-amber-700 hover:text-amber-900 p-2 rounded-lg hover:bg-amber-100"
                    title={muted ? "Дуут дохиог асаах" : "Дуут дохиог унтраах"}
                >
                    {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </button>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
                {/* Дахин өгөх хүсэлтүүд */}
                {retakes.map(req => (
                    <div
                        key={req.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-2 border-amber-200 bg-amber-50/60 p-4"
                    >
                        <div className="min-w-0">
                            <p className="font-bold text-slate-900">
                                {req.studentName || req.studentId}
                                <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                                    дахин өгөх
                                </span>
                            </p>
                            <p className="text-sm text-slate-600 truncate">{req.examTitle}</p>
                            {req.reason && (
                                <p className="text-xs text-slate-500 mt-1 italic">«{req.reason}»</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Link href={`/admin/exams/${req.examId}/monitor`}>
                                <Button variant="outline" size="sm" className="gap-1.5">
                                    <MonitorPlay className="w-3.5 h-3.5" /> Явц
                                </Button>
                            </Link>
                            <Button
                                size="sm"
                                disabled={busyId === req.id}
                                onClick={() => handleApprove(req.id, req.studentName || "Сурагч")}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                            >
                                {busyId === req.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                                Зөвшөөрөх
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={busyId === req.id}
                                onClick={() => handleReject(req.id, req.studentId, req.studentName || "Сурагч")}
                                className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                            >
                                <XCircle className="w-3.5 h-3.5" /> Татгалзах
                            </Button>
                        </div>
                    </div>
                ))}

                {/* Нээлттэй тусламжийн чат */}
                {tickets.map(t => (
                    <div
                        key={t.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-2 border-indigo-200 bg-indigo-50/60 p-4"
                    >
                        <div className="min-w-0">
                            <p className="font-bold text-slate-900">
                                {t.studentName || t.studentId}
                                <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900">
                                    тусламж
                                </span>
                            </p>
                            <p className="text-sm text-slate-600">{t.messageCount} мессеж — хариу хүлээж байна</p>
                        </div>
                        <Link href="/admin/support" className="shrink-0">
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5" /> Чат нээх
                            </Button>
                        </Link>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
