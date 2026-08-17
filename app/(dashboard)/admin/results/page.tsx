"use client";

import { useMemo, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam, ExamResult } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import SubmissionDetailModal from "@/components/admin/SubmissionDetailModal";
import { downloadCsv, formatDuration, safeFileName, todayStamp } from "@/lib/download";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
    Trophy,
    Search,
    Download,
    FileText,
    MonitorPlay,
    ChevronRight,
    BarChart3,
    ShieldAlert,
    ShieldCheck,
} from "lucide-react";

function toMillis(value: unknown): number {
    if (!value) return 0;
    const v = value as { toMillis?: () => number };
    if (typeof v.toMillis === "function") return v.toMillis();
    const d = new Date(value as string | number);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Админ — бүх шалгалтын дүнгийн нэгдсэн хуудас.
 *
 * Уншилтыг хэмнэхийн тулд эхлээд зөвхөн шалгалтуудын жагсаалтыг татна
 * (оролцогчийн тоо нь шалгалтын доккумент дээр аль хэдийн бий). Тодорхой
 * шалгалт сонгосон үед л тухайн шалгалтын дүнг нэмж татна.
 */
export default function AdminResultsPage() {
    const [selectedExamId, setSelectedExamId] = useState<string>("");
    const [search, setSearch] = useState("");
    const [detailFor, setDetailFor] = useState<{ studentId: string; name: string } | null>(null);
    const [validityBusyId, setValidityBusyId] = useState<string | null>(null);

    const { data: exams = [], isLoading: examsLoading } = useQuery<(Exam & { totalParticipants?: number })[]>({
        queryKey: ["admin_exams_for_results"],
        queryFn: async () => {
            const snap = await getDocs(query(collection(db, "exams"), orderBy("createdAt", "desc")));
            return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam & { totalParticipants?: number });
        },
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: results = [], isLoading: resultsLoading, refetch: refetchResults } = useQuery<ExamResult[]>({
        queryKey: ["admin_exam_results", selectedExamId],
        queryFn: async () => {
            const snap = await getDocs(query(collection(db, "exam_results"), where("examId", "==", selectedExamId)));
            return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ExamResult);
        },
        enabled: !!selectedExamId,
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const selectedExam = exams.find(e => e.id === selectedExamId);

    const ranked = useMemo(() => {
        const term = search.trim().toLowerCase();
        return [...results]
            .sort((a, b) => {
                if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
                return (a.timeTaken ?? 999999) - (b.timeTaken ?? 999999);
            })
            .filter(r => !term || (r.studentName || "").toLowerCase().includes(term));
    }, [results, search]);

    const stats = useMemo(() => {
        if (results.length === 0) return null;
        const total = results.length;
        const passed = results.filter(r => r.passed).length;
        const pcts = results.map(r => r.percentage ?? 0);
        return {
            total,
            passed,
            failed: total - passed,
            avg: Math.round(pcts.reduce((s, p) => s + p, 0) / total),
            max: Math.max(...pcts),
            min: Math.min(...pcts),
        };
    }, [results]);

    /** Зөрчлийн улмаас эргэлзээтэй болсон дүнг хүчинтэй болгох / буцаах. */
    const toggleValidity = async (result: ExamResult) => {
        const makeInvalid = !result.invalidatedByViolation;
        setValidityBusyId(result.id);
        try {
            const res = await fetch("/api/admin/results/validity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resultId: result.id, invalid: makeInvalid }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Алдаа гарлаа");
            toast.success(makeInvalid ? "Дүн хүчингүй болголоо" : "Дүн хүчинтэй болголоо");
            await refetchResults();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Өөрчлөхөд алдаа гарлаа");
        } finally {
            setValidityBusyId(null);
        }
    };

    const exportExamCsv = () => {
        if (ranked.length === 0) {
            toast.error("Татах дүн алга байна");
            return;
        }
        downloadCsv(
            ["Зэрэглэл", "Овог нэр", "Оноо", "Нийт оноо", "Хувь", "Дүгнэлт", "Зарцуулсан", "Зөрчил", "Төлөв"],
            ranked.map((r, i) => [
                r.invalidatedByViolation ? "" : (r.rank ?? i + 1),
                r.studentName || r.studentId,
                r.score ?? "",
                r.maxScore ?? "",
                `${r.percentage ?? 0}%`,
                r.passed ? "Тэнцсэн" : "Тэнцээгүй",
                formatDuration(r.timeTaken),
                r.violations ?? 0,
                r.invalidatedByViolation ? "Зөрчлийн улмаас хүчингүй" : "Хүчинтэй",
            ]),
            `${safeFileName(selectedExam?.title || "shalgalt")}_dun_${todayStamp()}.csv`,
        );
        toast.success("CSV татагдлаа");
    };

    const exportExamListCsv = () => {
        if (exams.length === 0) {
            toast.error("Шалгалт алга байна");
            return;
        }
        downloadCsv(
            ["Шалгалт", "Анги", "Огноо", "Үргэлжлэх (мин)", "Төлөв", "Оролцсон", "Тэнцэх босго"],
            exams.map(e => [
                e.title,
                `${e.grade}-р анги`,
                e.startedAt ? new Date(toMillis(e.startedAt)).toLocaleString("mn-MN") : "эхлээгүй",
                e.duration,
                e.status,
                e.totalParticipants ?? 0,
                e.passingScore ?? 0,
            ]),
            `shalgaltuud_${todayStamp()}.csv`,
        );
    };

    return (
        <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl bg-linear-to-r from-slate-50 to-blue-50/50 px-6 py-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-500" /> Шалгалтын дүн
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        Бүх шалгалтын үр дүн, сурагч бүрийн хариултын задаргаа, CSV татах
                    </p>
                </div>
                <Button variant="outline" onClick={exportExamListCsv} className="gap-2">
                    <Download className="w-4 h-4" /> Шалгалтын жагсаалт (CSV)
                </Button>
            </div>

            {/* ── Шалгалтуудын жагсаалт ─────────────────────────────────── */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                        Шалгалтууд
                        <span className="text-sm font-normal text-slate-500">({exams.length})</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {examsLoading ? (
                        <div className="py-10 text-center text-slate-500">Уншиж байна...</div>
                    ) : exams.length === 0 ? (
                        <div className="py-10 text-center text-slate-500">Одоогоор шалгалт үүсгээгүй байна.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-slate-500">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3">Шалгалт</th>
                                        <th className="px-4 py-3">Анги</th>
                                        <th className="px-4 py-3">Огноо</th>
                                        <th className="px-4 py-3 text-center">Төлөв</th>
                                        <th className="px-4 py-3 text-center">Оролцсон</th>
                                        <th className="px-4 py-3 text-right">Үйлдэл</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {exams.map(exam => (
                                        <tr
                                            key={exam.id}
                                            className={`border-b border-slate-100 cursor-pointer transition-colors ${
                                                selectedExamId === exam.id ? "bg-blue-50" : "bg-white hover:bg-slate-50"
                                            }`}
                                            onClick={() => { setSelectedExamId(exam.id); setSearch(""); }}
                                        >
                                            <td className="px-4 py-3 font-bold text-slate-900">{exam.title}</td>
                                            <td className="px-4 py-3">{exam.grade}-р анги</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {exam.startedAt
                                                    ? new Date(toMillis(exam.startedAt)).toLocaleString("mn-MN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) + "-д эхэлсэн"
                                                    : "Эхлээгүй"}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                                    exam.status === "published" ? "bg-emerald-100 text-emerald-800"
                                                        : exam.status === "draft" ? "bg-slate-100 text-slate-700"
                                                            : "bg-amber-100 text-amber-800"
                                                }`}>
                                                    {exam.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold text-slate-800">
                                                {exam.totalParticipants ?? 0}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-blue-600 hover:bg-blue-50 gap-1"
                                                        onClick={e => { e.stopPropagation(); setSelectedExamId(exam.id); setSearch(""); }}
                                                    >
                                                        Дүн харах <ChevronRight className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Link href={`/admin/exams/${exam.id}/monitor`} onClick={e => e.stopPropagation()}>
                                                        <Button variant="ghost" size="sm" className="text-emerald-700 hover:bg-emerald-50 gap-1">
                                                            <MonitorPlay className="w-3.5 h-3.5" /> Явц
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Сонгосон шалгалтын дүн ────────────────────────────────── */}
            {selectedExamId && (
                <Card className="border-0 shadow-lg">
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle className="flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-500" />
                            {selectedExam?.title || "Шалгалт"}
                            <span className="text-sm font-normal text-slate-500">({ranked.length})</span>
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <Input
                                    placeholder="Сурагч хайх..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="pl-9 w-52"
                                />
                            </div>
                            <Button onClick={exportExamCsv} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                                <Download className="w-4 h-4" /> CSV татах
                            </Button>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {stats && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-blue-700">Өгсөн</p>
                                    <p className="text-2xl font-black text-blue-900">{stats.total}</p>
                                </div>
                                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-emerald-700">Тэнцсэн</p>
                                    <p className="text-2xl font-black text-emerald-900">{stats.passed}</p>
                                </div>
                                <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-red-700">Тэнцээгүй</p>
                                    <p className="text-2xl font-black text-red-900">{stats.failed}</p>
                                </div>
                                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-amber-700">Дундаж</p>
                                    <p className="text-2xl font-black text-amber-900">{stats.avg}%</p>
                                </div>
                                <div className="rounded-xl bg-purple-50 border border-purple-100 p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-purple-700">Min – Max</p>
                                    <p className="text-lg font-black text-purple-900">{stats.min}% – {stats.max}%</p>
                                </div>
                            </div>
                        )}

                        {resultsLoading ? (
                            <div className="py-10 text-center text-slate-500">Дүн ачаалж байна...</div>
                        ) : ranked.length === 0 ? (
                            <div className="py-10 text-center text-slate-500">
                                Энэ шалгалтад дүн бүртгэгдээгүй байна.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-slate-500">
                                    <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3 text-center">#</th>
                                            <th className="px-4 py-3">Овог нэр</th>
                                            <th className="px-4 py-3 text-center">Оноо</th>
                                            <th className="px-4 py-3 text-center">Хувь</th>
                                            <th className="px-4 py-3 text-center">Дүгнэлт</th>
                                            <th className="px-4 py-3 text-center">Зарцуулсан</th>
                                            <th className="px-4 py-3 text-right">Үйлдэл</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ranked.map((r, i) => (
                                            <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 ${r.invalidatedByViolation ? "bg-amber-50/60" : "bg-white"}`}>
                                                <td className="px-4 py-3 text-center">
                                                    {r.invalidatedByViolation ? (
                                                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700" title="Зөрчлийн улмаас эрэмбэд ороогүй">
                                                            <ShieldAlert className="w-4 h-4" />
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs ${
                                                            i === 0 ? "bg-amber-100 text-amber-700"
                                                                : i === 1 ? "bg-slate-200 text-slate-700"
                                                                    : i === 2 ? "bg-orange-100 text-orange-700"
                                                                        : "bg-slate-100 text-slate-500"
                                                        }`}>
                                                            {r.rank ?? i + 1}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-900">
                                                    {r.studentName || r.studentId}
                                                    {r.invalidatedByViolation && (
                                                        <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                                            зөрчилтэй ({r.violations ?? 0})
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center font-bold text-slate-800">
                                                    {r.score}<span className="text-slate-400">/{r.maxScore}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`font-black ${
                                                        (r.percentage ?? 0) >= 80 ? "text-emerald-600"
                                                            : (r.percentage ?? 0) >= 50 ? "text-amber-600" : "text-red-500"
                                                    }`}>
                                                        {r.percentage}%
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                                                        r.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                                    }`}>
                                                        {r.passed ? "Тэнцлээ" : "Тэнцээгүй"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-slate-600">{formatDuration(r.timeTaken)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-blue-600 hover:bg-blue-50 gap-1"
                                                            onClick={() => setDetailFor({
                                                                studentId: r.studentId,
                                                                name: r.studentName || r.studentId,
                                                            })}
                                                        >
                                                            <FileText className="w-3.5 h-3.5" /> Хариулт
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={validityBusyId === r.id}
                                                            onClick={() => toggleValidity(r)}
                                                            className={r.invalidatedByViolation
                                                                ? "text-emerald-700 hover:bg-emerald-50 gap-1"
                                                                : "text-amber-700 hover:bg-amber-50 gap-1"}
                                                            title={r.invalidatedByViolation
                                                                ? "Дүнг хүчинтэй болгож эрэмбэд оруулах"
                                                                : "Дүнг зөрчлийн улмаас хүчингүй болгох"}
                                                        >
                                                            {r.invalidatedByViolation
                                                                ? <><ShieldCheck className="w-3.5 h-3.5" /> Хүчинтэй болгох</>
                                                                : <><ShieldAlert className="w-3.5 h-3.5" /> Хүчингүй</>}
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {detailFor && selectedExamId && (
                <SubmissionDetailModal
                    examId={selectedExamId}
                    studentId={detailFor.studentId}
                    studentName={detailFor.name}
                    onClose={() => setDetailFor(null)}
                />
            )}
        </div>
    );
}
