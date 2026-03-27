"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import { Registration, Exam, UserProfile } from "@/types";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { Clock, ShieldAlert, MonitorPlay, LogOut, CheckCircle, RotateCcw } from "lucide-react";
import { useConfirm } from "@/components/providers/ModalProvider";
import { useRouter } from "next/navigation";

interface RetakeRequest {
    id: string;
    studentId: string;
    studentName: string;
    examId: string;
    status: string;
    reason?: string;
}

interface MonitorClientProps {
    examId: string;
    exam: Exam;
    usersMap: Record<string, UserProfile>;
}

export default function MonitorClient({ examId, exam, usersMap }: MonitorClientProps) {
    const [registrations, setRegistrations] = useState<(Registration & { id: string })[]>([]);
    const [retakeRequests, setRetakeRequests] = useState<RetakeRequest[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isExtending, setIsExtending] = useState(false);
    const confirm = useConfirm();
    const router = useRouter();

    useEffect(() => {
        // Live listen to registrations
        const qReg = query(collection(db, "registrations"), where("examId", "==", examId));
        const unsubReg = onSnapshot(qReg, (snap) => {
            const regs: (Registration & { id: string })[] = [];
            snap.forEach(doc => {
                regs.push({ id: doc.id, ...doc.data() } as Registration & { id: string });
            });
            setRegistrations(regs);
        });

        // Live listen to retake_requests for this exam
        const qReq = query(collection(db, "retake_requests"), where("examId", "==", examId));
        const unsubReq = onSnapshot(qReq, (snap) => {
            const reqs: RetakeRequest[] = [];
            snap.forEach(doc => {
                reqs.push({ id: doc.id, ...doc.data() } as RetakeRequest);
            });
            // Filter only pending requests
            setRetakeRequests(reqs.filter(r => r.status === "pending"));
        });

        return () => {
            unsubReg();
            unsubReq();
        };
    }, [examId]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(registrations.map(r => r.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleExtendTime = async (minutes: number) => {
        if (selectedIds.size === 0) {
            return toast.error("Сурагч сонгоно уу");
        }
        
        const ok = await confirm({
            title: "Цаг сунгах",
            message: `Сонгогдсон ${selectedIds.size} сурагчид ${minutes} минут сунгах уу?`,
            confirmLabel: "Сунгах"
        });
        if (!ok) return;

        setIsExtending(true);
        try {
            const batch = writeBatch(db);
            selectedIds.forEach(id => {
                const reg = registrations.find(r => r.id === id);
                if (reg) {
                    const currentExt = reg.extendedTime || 0;
                    batch.update(doc(db, "registrations", id), {
                        extendedTime: currentExt + (minutes * 60)
                    });
                }
            });
            await batch.commit();
            toast.success("Цаг амжилттай сунгагдлаа");
            setSelectedIds(new Set());
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Цаг сунгахад алдаа гарлаа");
        } finally {
            setIsExtending(false);
        }
    };

    const handleForceSubmit = async (regId: string) => {
        const ok = await confirm({
            title: "Шууд дуусгах",
            message: "Та энэ сурагчийн шалгалтыг шууд дуусгах (Force Submit) гэж байна. Итгэлтэй байна уу?",
            confirmLabel: "Дуусгах",
            variant: "destructive"
        });
        if (!ok) return;

        try {
            await updateDoc(doc(db, "registrations", regId), {
                forceSubmitted: true
            });
            toast.success("Шалгалтыг шууд дуусгах төлөв рүү шилжүүллээ. Сурагчийн цонхонд автоматаар хаагдах болно.");
        } catch (e) {
            toast.error("Алдаа гарлаа: " + (e instanceof Error ? e.message : String(e)));
        }
    };

    const handleApproveRetake = async (reqId: string, studentId: string) => {
        const ok = await confirm({
            title: "Хүсэлт зөвшөөрөх",
            message: "Шалгалт дундуур гацсан/унтарсан хүсэлтийг зөвшөөрөх үү? Ингэснээр сурагчийн статусыг Registered болгож буцаан оруулна.",
            confirmLabel: "Зөвшөөрөх"
        });
        if (!ok) return;

        try {
            const batch = writeBatch(db);
            // 1. Mark request as approved
            batch.update(doc(db, "retake_requests", reqId), { status: "approved" });
            
            // 2. Clear completed status if any so they can re-enter
            const reg = registrations.find(r => r.studentId === studentId);
            if (reg) {
                batch.update(doc(db, "registrations", reg.id), {
                    status: "started", // put them directly into started
                    forceSubmitted: false, // un-force if stuck
                });
            }
            await batch.commit();
            toast.success("Хүсэлт батлагдлаа. Сурагч дахин үргэлжлүүлэн орох боломжтой.");
        } catch (e) {
            toast.error("Алдаа гарлаа: " + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 pb-24">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <MonitorPlay className="w-7 h-7 text-blue-600" />
                        Шууд хяналт: {exam.title}
                    </h1>
                    <p className="text-slate-500 font-medium">
                        Атсан огноо: {new Date(exam.scheduledAt).toLocaleString()} • {exam.duration} минут
                    </p>
                </div>
                <Button variant="outline" onClick={() => router.push("/admin/exams")}>
                    Буцах
                </Button>
            </div>

            {/* Live Retake Requests Area */}
            {retakeRequests.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm animate-pulse">
                    <h2 className="text-amber-800 font-bold mb-3 flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5" />
                        Яаралтай хүсэлтүүд (Гацсан / Дутуу гарсан)
                    </h2>
                    <div className="space-y-3">
                        {retakeRequests.map(req => (
                            <div key={req.id} className="flex flex-col sm:flex-row justify-between items-center bg-white p-3 rounded-xl shadow-sm">
                                <div>
                                    <p className="font-bold text-slate-900">{req.studentName}</p>
                                    <p className="text-sm text-slate-500">{req.reason || "Шалтгаан бичээгүй"}</p>
                                </div>
                                <Button size="sm" onClick={() => handleApproveRetake(req.id, req.studentId)} className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2 sm:mt-0">
                                    Оруулж үргэлжлүүлэх
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Mass Actions */}
            <Card className="border-0 shadow-lg sticky top-4 z-10 bg-white/90 backdrop-blur-md">
                <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
                    <div className="text-sm font-bold text-slate-700">
                        {selectedIds.size} сурагч сонгосон байна
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            disabled={selectedIds.size === 0 || isExtending}
                            onClick={() => handleExtendTime(5)}
                            className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                        >
                            +5 минут
                        </Button>
                        <Button 
                            variant="outline"
                            disabled={selectedIds.size === 0 || isExtending}
                            onClick={() => handleExtendTime(10)}
                            className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                        >
                            +10 минут
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Registrations list */}
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-900 font-bold border-b border-slate-100 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        onChange={handleSelectAll} 
                                        checked={selectedIds.size > 0 && selectedIds.size === registrations.length}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </th>
                                <th className="px-6 py-4">Овог нэр</th>
                                <th className="px-6 py-4">Анги</th>
                                <th className="px-6 py-4">IP Хаяг</th>
                                <th className="px-6 py-4 text-center">Төлөв</th>
                                <th className="px-6 py-4 text-center">Нэмэлт цаг</th>
                                <th className="px-6 py-4 text-right">Үйлдэл</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {registrations.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 font-medium">
                                        Одоогоор бүртгэлтэй сурагч алга байна.
                                    </td>
                                </tr>
                            ) : (
                                registrations.map(reg => {
                                    const user = usersMap[reg.studentId] || {};
                                    return (
                                        <tr key={reg.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(reg.id)}
                                                    onChange={() => handleSelect(reg.id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900">{user.lastName} {user.firstName || reg.studentId}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{user.email || ""}</div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 font-medium font-mono text-xs">
                                                {user.class || user.grade || "Зочин"}
                                            </td>
                                            <td className="px-6 py-4">
                                                {reg.ipAddress ? (
                                                    <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                                                        {reg.ipAddress}
                                                    </span>
                                                ) : <span className="text-xs text-slate-400">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {reg.forceSubmitted ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 px-2 py-1 rounded-full border border-rose-200">
                                                        <LogOut className="w-3 h-3" /> Хүчээр дууссан
                                                    </span>
                                                ) : reg.status === "completed" ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full border border-emerald-200">
                                                        <CheckCircle className="w-3 h-3" /> Дууссан
                                                    </span>
                                                ) : reg.status === "started" ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-200">
                                                        <RotateCcw className="w-3 h-3 animate-spin"/> Явагдаж байна
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-full">
                                                        Бүртгэлтэй
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {reg.extendedTime ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                                                        <Clock className="w-3 h-3" /> +{reg.extendedTime / 60} мин
                                                    </span>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    disabled={reg.status === "completed" || reg.forceSubmitted || reg.status !== "started"}
                                                    onClick={() => handleForceSubmit(reg.id)}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    Шууд дуусгах
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
