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
import { RetakeService } from "@/lib/services/retake-service";
import { ExamService } from "@/lib/services/exam-service";
import { useAuth } from "@/components/AuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface RetakeRequest {
    id: string;
    studentId: string;
    studentName: string;
    examId: string;
    status: string;
    reason?: string;
}

interface ResultEntry {
    studentId: string;
    score: number;
    maxScore: number;
    percentage: number;
    passed: boolean;
    rank: number | null;
    timeTaken?: number;
}

interface MonitorClientProps {
    examId: string;
    exam: Exam;
    usersMap: Record<string, UserProfile>;
}

export default function MonitorClient({ examId, exam, usersMap }: MonitorClientProps) {
    const [registrations, setRegistrations] = useState<(Registration & { id: string })[]>([]);
    const [retakeRequests, setRetakeRequests] = useState<RetakeRequest[]>([]);
    const [results, setResults] = useState<Record<string, ResultEntry>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedRetakeIds, setSelectedRetakeIds] = useState<Set<string>>(new Set());
    const [isBulkRetakeBusy, setIsBulkRetakeBusy] = useState(false);
    const [isExtending, setIsExtending] = useState(false);
    const [forceSubmittingId, setForceSubmittingId] = useState<string | null>(null);
    const confirm = useConfirm();
    const router = useRouter();
    const { user: adminUser } = useAuth();

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

        // Live listen to exam_results — оноо харуулах
        const qRes = query(collection(db, "exam_results"), where("examId", "==", examId));
        const unsubRes = onSnapshot(qRes, (snap) => {
            const map: Record<string, ResultEntry> = {};
            snap.forEach(d => {
                const data = d.data();
                map[data.studentId] = {
                    studentId: data.studentId,
                    score: data.score ?? 0,
                    maxScore: data.maxScore ?? 0,
                    percentage: data.percentage ?? 0,
                    passed: !!data.passed,
                    rank: data.rank ?? null,
                    timeTaken: data.timeTaken,
                };
            });
            setResults(map);
        });

        return () => {
            unsubReg();
            unsubReq();
            unsubRes();
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

    // FIX 20: Cap total extension at the original exam duration. The total
    // extendedTime (in seconds) across all admin actions must never exceed
    // exam.duration * 60. Students whose new total would cross the cap are
    // skipped with a per-student toast — the rest of the batch still applies.
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

        const MAX_TOTAL_EXTENSION_MIN = exam.duration; // Cap at original duration
        const maxTotalSeconds = MAX_TOTAL_EXTENSION_MIN * 60;

        setIsExtending(true);
        try {
            const batch = writeBatch(db);
            let scheduled = 0;
            selectedIds.forEach(id => {
                const reg = registrations.find(r => r.id === id);
                if (!reg) return;
                const currentExt = reg.extendedTime || 0;
                const newTotal = currentExt + (minutes * 60);
                if (newTotal > maxTotalSeconds) {
                    const display = usersMap[reg.studentId];
                    const label = display
                        ? `${display.lastName || ""} ${display.firstName || ""}`.trim() || reg.studentId
                        : reg.studentId;
                    toast.error(`${label}-ийн нэмэлт цаг хязгаараас (${MAX_TOTAL_EXTENSION_MIN} мин) хэтэрсэн`);
                    return;
                }
                batch.update(doc(db, "registrations", id), {
                    extendedTime: newTotal
                });
                scheduled++;
            });
            if (scheduled === 0) {
                toast.error("Сонгогдсон сурагч бүгд нэмэлт цагийн хязгаараа хүрсэн байна");
                return;
            }
            await batch.commit();
            toast.success(`${scheduled} сурагчид цаг амжилттай сунгагдлаа`);
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

    const toggleRetakeSelect = (id: string) => {
        const next = new Set(selectedRetakeIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedRetakeIds(next);
    };

    const handleBulkApproveRetakes = async () => {
        if (selectedRetakeIds.size === 0) return;
        const ok = await confirm({
            title: "Бүгдийг зөвшөөрөх",
            message: `Сонгогдсон ${selectedRetakeIds.size} хүсэлтийг зөвшөөрөх үү?`,
            confirmLabel: "Зөвшөөрөх"
        });
        if (!ok) return;

        setIsBulkRetakeBusy(true);
        try {
            const { successful, failed } = await RetakeService.bulkApprove(Array.from(selectedRetakeIds));
            if (failed === 0) {
                toast.success(`${successful} хүсэлт зөвшөөрөгдлөө`);
            } else {
                toast.warning(`${successful} амжилттай, ${failed} алдаатай`);
            }
            setSelectedRetakeIds(new Set());
        } catch (e) {
            toast.error("Алдаа гарлаа: " + (e instanceof Error ? e.message : String(e)));
        } finally {
            setIsBulkRetakeBusy(false);
        }
    };

    const handleBulkRejectRetakes = async () => {
        if (selectedRetakeIds.size === 0) return;
        const ok = await confirm({
            title: "Бүгдийг татгалзах",
            message: `Сонгогдсон ${selectedRetakeIds.size} хүсэлтийг татгалзах уу?`,
            confirmLabel: "Татгалзах",
            variant: "destructive"
        });
        if (!ok) return;

        setIsBulkRetakeBusy(true);
        try {
            const { successful, failed } = await RetakeService.bulkReject(Array.from(selectedRetakeIds));
            if (failed === 0) {
                toast.success(`${successful} хүсэлт татгалзагдлаа`);
            } else {
                toast.warning(`${successful} амжилттай, ${failed} алдаатай`);
            }
            setSelectedRetakeIds(new Set());
        } catch (e) {
            toast.error("Алдаа гарлаа: " + (e instanceof Error ? e.message : String(e)));
        } finally {
            setIsBulkRetakeBusy(false);
        }
    };

    // B2: Admin force-submit on behalf of a student whose tab can't submit
    // (offline, frozen, etc.). Submits the latest server-side draftAnswers
    // through the regular grading pipeline with adminOverride.
    const handleAdminForceSubmit = async (reg: Registration & { id: string }) => {
        if (!adminUser?.uid) {
            toast.error("Админ нэвтрэлт тогтоогдсонгүй");
            return;
        }
        const ok = await confirm({
            title: "Албадан илгээх",
            message: "Сурагчийн одоогийн draft хариултыг сервер талаас албадан илгээх үү? Энэ үйлдэл нь дүн тооцоолж, бичлэгийг 'completed' болгоно.",
            confirmLabel: "Албадан илгээх",
            variant: "destructive",
        });
        if (!ok) return;

        setForceSubmittingId(reg.id);
        try {
            await ExamService.forceSubmitFromDraft(reg.studentId, examId, adminUser.uid);
            toast.success("Сурагчийн шалгалт серверээс албадан илгээгдлээ");
        } catch (e) {
            toast.error("Алдаа гарлаа: " + (e instanceof Error ? e.message : String(e)));
        } finally {
            setForceSubmittingId(null);
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
            // A4: Use the shared RetakeService implementation so single + bulk approval
            // paths share the same atomic batch (registration reset, results/submissions
            // cleanup, notification). No more duplicate inline batch logic here.
            await RetakeService.approveRequest(reqId, studentId, examId);
            toast.success("Дахин шалгалт зөвшөөрөгдлөө");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
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
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                        <h2 className="text-amber-800 font-bold flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5" />
                            Яаралтай хүсэлтүүд (Гацсан / Дутуу гарсан)
                        </h2>
                        {selectedRetakeIds.size > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-amber-800">{selectedRetakeIds.size} сонгосон</span>
                                <Button
                                    size="sm"
                                    disabled={isBulkRetakeBusy}
                                    onClick={handleBulkApproveRetakes}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    Бүгдийг зөвшөөрөх
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isBulkRetakeBusy}
                                    onClick={handleBulkRejectRetakes}
                                    className="border-red-200 text-red-700 hover:bg-red-50"
                                >
                                    Бүгдийг татгалзах
                                </Button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-3">
                        {retakeRequests.map(req => (
                            <div key={req.id} className="flex flex-col sm:flex-row justify-between items-center bg-white p-3 rounded-xl shadow-sm">
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <input
                                        type="checkbox"
                                        checked={selectedRetakeIds.has(req.id)}
                                        onChange={() => toggleRetakeSelect(req.id)}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                        <p className="font-bold text-slate-900">{req.studentName}</p>
                                        <p className="text-sm text-slate-500">{req.reason || "Шалтгаан бичээгүй"}</p>
                                    </div>
                                </div>
                                <Button size="sm" onClick={() => handleApproveRetake(req.id, req.studentId)} className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2 sm:mt-0">
                                    Оруулж үргэлжлүүлэх
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Дүнгийн товчлол — Statistics Summary */}
            {Object.keys(results).length > 0 && (() => {
                const resultsArr = Object.values(results);
                const total = resultsArr.length;
                const passed = resultsArr.filter(r => r.passed).length;
                const failed = total - passed;
                const avgPct = total > 0 ? Math.round(resultsArr.reduce((s, r) => s + r.percentage, 0) / total) : 0;
                const maxPct = total > 0 ? Math.max(...resultsArr.map(r => r.percentage)) : 0;
                const minPct = total > 0 ? Math.min(...resultsArr.map(r => r.percentage)) : 0;
                return (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
                            <CardContent className="p-4">
                                <p className="text-xs text-blue-700 font-bold uppercase">Дууссан</p>
                                <p className="text-2xl font-black text-blue-900">{total}</p>
                            </CardContent>
                        </Card>
                        <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-emerald-100">
                            <CardContent className="p-4">
                                <p className="text-xs text-emerald-700 font-bold uppercase">Тэнцсэн</p>
                                <p className="text-2xl font-black text-emerald-900">{passed}</p>
                            </CardContent>
                        </Card>
                        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 to-red-100">
                            <CardContent className="p-4">
                                <p className="text-xs text-red-700 font-bold uppercase">Тэнцээгүй</p>
                                <p className="text-2xl font-black text-red-900">{failed}</p>
                            </CardContent>
                        </Card>
                        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-amber-100">
                            <CardContent className="p-4">
                                <p className="text-xs text-amber-700 font-bold uppercase">Дундаж</p>
                                <p className="text-2xl font-black text-amber-900">{avgPct}%</p>
                            </CardContent>
                        </Card>
                        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-purple-100">
                            <CardContent className="p-4">
                                <p className="text-xs text-purple-700 font-bold uppercase">Min - Max</p>
                                <p className="text-lg font-black text-purple-900">{minPct}% - {maxPct}%</p>
                            </CardContent>
                        </Card>
                    </div>
                );
            })()}

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
            <ErrorBoundary label="Сурагчдын дүн ачаалахад алдаа">
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
                                <th className="px-6 py-4 text-center">Оноо</th>
                                <th className="px-6 py-4 text-center">Хувь</th>
                                <th className="px-6 py-4 text-center">Зэрэглэл</th>
                                <th className="px-6 py-4 text-center">Нэмэлт цаг</th>
                                <th className="px-6 py-4 text-right">Үйлдэл</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {registrations.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-12 text-center text-slate-500 font-medium">
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
                                            {/* Оноо */}
                                            <td className="px-6 py-4 text-center">
                                                {results[reg.studentId] ? (
                                                    <span className="font-bold text-slate-800">
                                                        {results[reg.studentId].score}<span className="text-slate-400">/{results[reg.studentId].maxScore}</span>
                                                    </span>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            {/* Хувь + тэнцсэн badge */}
                                            <td className="px-6 py-4 text-center">
                                                {results[reg.studentId] ? (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className={`font-black text-base ${results[reg.studentId].percentage >= 80 ? "text-emerald-600" : results[reg.studentId].percentage >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                                            {results[reg.studentId].percentage}%
                                                        </span>
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${results[reg.studentId].passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                                            {results[reg.studentId].passed ? "Тэнцлээ" : "Тэнцээгүй"}
                                                        </span>
                                                    </div>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            {/* Зэрэглэл */}
                                            <td className="px-6 py-4 text-center">
                                                {results[reg.studentId]?.rank ? (
                                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                                                        {results[reg.studentId].rank}
                                                    </span>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {reg.extendedTime ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                                                        <Clock className="w-3 h-3" /> +{reg.extendedTime / 60} мин
                                                    </span>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={reg.status === "completed" || reg.forceSubmitted || reg.status !== "started"}
                                                        onClick={() => handleForceSubmit(reg.id)}
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        Шууд дуусгах
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={
                                                            reg.status === "completed" ||
                                                            reg.status === "registered" ||
                                                            forceSubmittingId === reg.id
                                                        }
                                                        onClick={() => handleAdminForceSubmit(reg)}
                                                        className="text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                                                        title="Серверийн draft хариултыг ашиглан албадан илгээх"
                                                    >
                                                        {forceSubmittingId === reg.id ? "Илгээж байна..." : "Албадан илгээх"}
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            </ErrorBoundary>
        </div>
    );
}
