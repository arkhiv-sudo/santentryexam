"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import { Registration, Exam, UserProfile } from "@/types";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { Clock, ShieldAlert, MonitorPlay, LogOut, CheckCircle, RotateCcw, FileText, Download, Info, Play, BellRing, UserCheck, Hourglass, DoorOpen } from "lucide-react";
import { useChangeFlash, useFlipRows, usePrefersReducedMotion } from "@/lib/row-animation";
import { useConfirm } from "@/components/providers/ModalProvider";
import { useRouter } from "next/navigation";
import { RetakeService } from "@/lib/services/retake-service";
import { ExamService } from "@/lib/services/exam-service";
import { useAuth } from "@/components/AuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SubmissionDetailModal from "@/components/admin/SubmissionDetailModal";
import { downloadCsv, formatDuration, safeFileName, todayStamp } from "@/lib/download";

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
    invalidatedByViolation?: boolean;
}

interface MonitorClientProps {
    examId: string;
    exam: Exam;
    usersMap: Record<string, UserProfile>;
}

type RegRow = Registration & { id: string };

/** `draftAnswers` доторх хоосон биш хариултын тоо (нэмэлт Firestore уншилтгүй). */
function countAnswered(reg: RegRow): number {
    const draft = reg.draftAnswers;
    if (!draft) return 0;
    let n = 0;
    for (const value of Object.values(draft)) {
        if (value === null || value === undefined) continue;
        if (String(value).trim() === "") continue;
        n++;
    }
    return n;
}

/** Эрэмбийн бүлэг: 0 = дүнтэй, 1 = шалгалт өгч байгаа, 2 = дүн хүлээж буй, 3 = эхлээгүй. */
function sortTier(reg: RegRow, hasResult: boolean): number {
    if (hasResult) return 0;
    if (reg.status === "started") return 1;
    if (reg.status === "completed") return 2;
    return 3;
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
    const [detailFor, setDetailFor] = useState<{ studentId: string; name: string } | null>(null);
    /** Шалгалтыг админ эхлүүлсэн мөч (сервер дата, шууд сонсогчоор шинэчлэгдэнэ). */
    const [startedAt, setStartedAt] = useState<number | null>(
        (exam as unknown as { startedAt?: Date | string | null }).startedAt
            ? new Date((exam as unknown as { startedAt: Date | string }).startedAt).getTime()
            : null,
    );
    const [startingExam, setStartingExam] = useState(false);
    const [nudgingId, setNudgingId] = useState<string | null>(null);
    const confirm = useConfirm();
    const router = useRouter();
    const { user: adminUser } = useAuth();
    const reducedMotion = usePrefersReducedMotion();

    /** Энэ шалгалтын нийт асуултын тоо — явцын хувь бодоход хэрэглэнэ. */
    const totalQuestions = exam.questionIds?.length ?? 0;

    /**
     * Хүснэгтийн эрэмбэ: дүнтэй нь оноо ихээс бага руу (тэнцвэл хурдан
     * дуусгасан нь дээш), дараа нь шалгалт өгч байгаа хүмүүс хариулсан
     * асуултын тоогоор, хамгийн доор нь эхлээгүй сурагчид.
     */
    const sortedRegistrations = useMemo(() => {
        const nameOf = (reg: RegRow) => {
            const u = usersMap[reg.studentId];
            return `${u?.lastName || ""} ${u?.firstName || ""}`.trim() || reg.studentId;
        };
        return [...registrations].sort((a, b) => {
            const ra = results[a.studentId];
            const rb = results[b.studentId];
            const ta = sortTier(a, !!ra);
            const tb = sortTier(b, !!rb);
            if (ta !== tb) return ta - tb;

            if (ta === 0 && ra && rb) {
                if (rb.score !== ra.score) return rb.score - ra.score;          // оноо ихээс бага руу
                const timeA = ra.timeTaken ?? Number.POSITIVE_INFINITY;
                const timeB = rb.timeTaken ?? Number.POSITIVE_INFINITY;
                if (timeA !== timeB) return timeA - timeB;                       // хурдан нь дээш
            } else if (ta === 1) {
                const ca = countAnswered(a);
                const cb = countAnswered(b);
                if (cb !== ca) return cb - ca;                                    // хариулсан нь дээш
            }

            const byName = nameOf(a).localeCompare(nameOf(b), "mn");
            return byName !== 0 ? byName : a.id.localeCompare(b.id);              // тогтвортой эрэмбэ
        });
    }, [registrations, results, usersMap]);

    // Мөр байрлалаа солиход зөөлөн гулсуулах (FLIP).
    const { registerRow } = useFlipRows<HTMLTableRowElement>(
        useMemo(() => sortedRegistrations.map(r => r.id), [sortedRegistrations]),
        { disabled: reducedMotion },
    );

    // Оноо нь шинээр ирсэн / өөрчлөгдсөн сурагчийн мөрийг ~1.5 сек анивчуулах.
    const scoreSignatures = useMemo(() => {
        const map: Record<string, string> = {};
        for (const r of Object.values(results)) {
            map[r.studentId] = `${r.score}/${r.maxScore}/${r.percentage}`;
        }
        return map;
    }, [results]);
    const flashingStudents = useChangeFlash(scoreSignatures, { disabled: reducedMotion });

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

        // Шалгалтын доккумент — админ эхлүүлмэгц бүх төлөв шинэчлэгдэнэ
        const unsubExam = onSnapshot(doc(db, "exams", examId), d => {
            if (d.exists()) {
                const st = (d.data().startedAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? null;
                setStartedAt(st);
            }
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
                    invalidatedByViolation: data.invalidatedByViolation === true,
                };
            });
            setResults(map);
        });

        return () => {
            unsubReg();
            unsubReq();
            unsubRes();
            unsubExam();
        };
    }, [examId]);

    /** Шалгалтыг БҮГДЭД зэрэг эхлүүлэх. */
    const handleStartExam = async () => {
        const readyCount = registrations.filter(r => r.status === "ready").length;
        const notReady = registrations.length - readyCount;
        const ok = await confirm({
            title: "Шалгалтыг бүгдэд эхлүүлэх",
            message: notReady > 0
                ? `Бэлэн болсон ${readyCount} сурагчид шалгалт эхэлнэ. Бэлэн болоогүй ${notReady} сурагч ОРЖ ЧАДАХГҮЙ (дараа нь та тусад нь оруулж болно). Үргэлжлүүлэх үү?`
                : `${readyCount} сурагч бүгд бэлэн байна. Шалгалтыг эхлүүлэх үү? Цаг тэр дороос тоологдоно.`,
            confirmLabel: "Эхлүүлэх",
            variant: notReady > 0 ? "destructive" : "default",
        });
        if (!ok) return;
        setStartingExam(true);
        try {
            const res = await fetch(`/api/admin/exams/${examId}/control`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "start" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Эхлүүлэхэд алдаа гарлаа");
            toast.success(`Шалгалт эхэллээ — ${data.started} сурагч оров`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
        } finally {
            setStartingExam(false);
        }
    };

    /** Бэлэн болоогүй сурагчид сануулга илгээх (дэлгэц дүүрэн анхааруулга + дуу). */
    const handleNudge = async (studentId: string, name: string) => {
        setNudgingId(studentId);
        try {
            const res = await fetch(`/api/admin/exams/${examId}/control`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "nudge", studentId }),
            });
            if (!res.ok) throw new Error((await res.json()).error || "Алдаа");
            toast.success(`${name} — сануулга илгээлээ`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
        } finally {
            setNudgingId(null);
        }
    };

    /** Хоцорсон сурагчийг тусгайлан оруулах. */
    const handleAdmit = async (studentId: string, name: string) => {
        const ok = await confirm({
            title: "Хоцорсон сурагчийг оруулах",
            message: `${name}-г шалгалт руу оруулах уу? Түүнд үлдсэн хугацаа л ногдоно.`,
            confirmLabel: "Оруулах",
        });
        if (!ok) return;
        setNudgingId(studentId);
        try {
            const res = await fetch(`/api/admin/exams/${examId}/control`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "admit", studentId }),
            });
            if (!res.ok) throw new Error((await res.json()).error || "Алдаа");
            toast.success(`${name} — оруулав`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
        } finally {
            setNudgingId(null);
        }
    };

    /** Энэ шалгалтын бүх сурагчийн явц + дүнг CSV болгон татах. */
    const exportResultsCsv = () => {
        if (registrations.length === 0) {
            toast.error("Татах дата алга байна");
            return;
        }
        const statusLabel = (reg: Registration & { id: string }) =>
            reg.forceSubmitted ? "Хүчээр дууссан"
                : reg.status === "completed" ? "Дууссан"
                    : reg.status === "started" ? "Явагдаж байна"
                        : "Бүртгэлтэй";

        const rows = [...registrations]
            .sort((a, b) => (results[a.studentId]?.rank ?? 9999) - (results[b.studentId]?.rank ?? 9999))
            .map(reg => {
                const u = usersMap[reg.studentId] || {};
                const r = results[reg.studentId];
                return [
                    r?.rank ?? "",
                    `${u.lastName || ""} ${u.firstName || ""}`.trim() || reg.studentId,
                    u.class || u.grade || "",
                    u.phone || "",
                    statusLabel(reg),
                    r?.score ?? "",
                    r?.maxScore ?? "",
                    r ? `${r.percentage}%` : "",
                    r ? (r.passed ? "Тэнцсэн" : "Тэнцээгүй") : "",
                    formatDuration(r?.timeTaken),
                    reg.violations ?? 0,
                    r?.invalidatedByViolation ? "Зөрчлийн улмаас хүчингүй" : (r ? "Хүчинтэй" : ""),
                    reg.extendedTime ? `${reg.extendedTime / 60} мин` : "",
                    reg.ipAddress || "",
                ];
            });

        downloadCsv(
            ["Зэрэглэл", "Овог нэр", "Анги", "Утас", "Төлөв", "Оноо", "Нийт оноо", "Хувь", "Дүгнэлт", "Зарцуулсан", "Зөрчил", "Дүнгийн төлөв", "Нэмэлт цаг", "IP хаяг"],
            rows,
            `${safeFileName(exam.title || "shalgalt")}_dun_${todayStamp()}.csv`,
        );
        toast.success("CSV татагдлаа");
    };

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

    const handleApproveRetake = async (reqId: string) => {
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
            await RetakeService.approveRequest(reqId);
            toast.success("Дахин шалгалт зөвшөөрөгдлөө");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
        }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 pb-24">
            {/* Мөр анивчих анимаци — шинэ дүн ирэхэд анхаарал татна. */}
            <style>{`
@keyframes monitorRowFlash {
    0%   { background-color: rgba(16, 185, 129, 0.30); }
    35%  { background-color: rgba(16, 185, 129, 0.22); }
    100% { background-color: rgba(16, 185, 129, 0); }
}
.monitor-row-flash { animation: monitorRowFlash 1.5s ease-out 1; }
@media (prefers-reduced-motion: reduce) {
    .monitor-row-flash { animation: none; }
}
`}</style>
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <MonitorPlay className="w-7 h-7 text-blue-600" />
                        Шууд хяналт: {exam.title}
                    </h1>
                    <p className="text-slate-500 font-medium">
                        {startedAt
                            ? `${new Date(startedAt).toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" })}-д эхэлсэн`
                            : "Хараахан эхлээгүй"} • {exam.duration} минут
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
                                <Button size="sm" onClick={() => handleApproveRetake(req.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2 sm:mt-0">
                                    Оруулж үргэлжлүүлэх
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Хүлээх танхим: шалгалт эхлэхээс ӨМНӨ ────────────────────── */}
            {!startedAt && (
                <Card className="border-0 shadow-xl ring-2 ring-indigo-300 overflow-hidden">
                    <div className="bg-linear-to-r from-indigo-600 to-blue-600 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="text-white">
                            <h2 className="text-xl font-black flex items-center gap-2">
                                <Hourglass className="w-5 h-5" /> Хүлээх танхим
                            </h2>
                            <p className="text-blue-100 text-sm mt-1">
                                Сурагчид «Бэлэн боллоо» дарж хүлээж байна. Та эхлүүлэхэд бүгдэд <strong>зэрэг</strong> эхэлнэ.
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-center text-white">
                                <div className="text-3xl font-black">
                                    {registrations.filter(r => r.status === "ready").length}
                                    <span className="text-blue-200">/{registrations.length}</span>
                                </div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Бэлэн</div>
                            </div>
                            <Button
                                onClick={handleStartExam}
                                disabled={startingExam || registrations.filter(r => r.status === "ready").length === 0}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-black h-14 px-8 rounded-2xl text-lg gap-2 shadow-lg disabled:opacity-50"
                            >
                                <Play className="w-5 h-5" /> {startingExam ? "Эхлүүлж байна..." : "Бүгдэд эхлүүлэх"}
                            </Button>
                        </div>
                    </div>

                    <CardContent className="p-4">
                        {registrations.length === 0 ? (
                            <p className="text-center text-slate-500 py-6 font-medium">Сурагч хараахан ороогүй байна…</p>
                        ) : (
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {sortedRegistrations.map(reg => {
                                    const u = usersMap[reg.studentId] || {};
                                    const name = `${u.lastName || ""} ${u.firstName || ""}`.trim() || reg.studentId;
                                    const ready = reg.status === "ready";
                                    return (
                                        <div key={reg.id} className={`flex items-center justify-between gap-2 rounded-xl border-2 p-3 ${ready ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50/60"}`}>
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-900 truncate">{name}</p>
                                                <p className={`text-xs font-bold flex items-center gap-1 ${ready ? "text-emerald-700" : "text-amber-700"}`}>
                                                    {ready ? <><UserCheck className="w-3 h-3" /> Бэлэн</> : <><Hourglass className="w-3 h-3" /> Бэлэн болоогүй</>}
                                                </p>
                                            </div>
                                            {!ready && (
                                                <Button
                                                    size="sm" variant="outline"
                                                    disabled={nudgingId === reg.studentId}
                                                    onClick={() => handleNudge(reg.studentId, name)}
                                                    className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-100 shrink-0"
                                                >
                                                    <BellRing className="w-3.5 h-3.5" /> Сануулах
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
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
                        <Button
                            variant="outline"
                            onClick={exportResultsCsv}
                            className="gap-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                        >
                            <Download className="w-4 h-4" /> Дүн татах (CSV)
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
                                <th className="px-6 py-4 text-center">
                                    <span
                                        className="inline-flex items-center gap-1 cursor-help"
                                        title="Явцын мэдээлэл сурагчийн браузераас ~1 минут тутам хадгалагддаг тул 1 хүртэл минут хоцрогдож болно"
                                    >
                                        Оноо / Явц
                                        <Info className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
                                    </span>
                                </th>
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
                                sortedRegistrations.map(reg => {
                                    const user = usersMap[reg.studentId] || {};
                                    const result = results[reg.studentId];
                                    const isFlashing = flashingStudents.has(reg.studentId);
                                    const isRunning = !result && reg.status === "started";
                                    const answered = isRunning ? countAnswered(reg) : 0;
                                    const progressPct = isRunning && totalQuestions > 0
                                        ? Math.min(100, Math.round((answered / totalQuestions) * 100))
                                        : 0;
                                    return (
                                        <tr
                                            key={reg.id}
                                            ref={registerRow(reg.id)}
                                            className={`hover:bg-slate-50/50 transition-colors ${isFlashing ? "monitor-row-flash" : ""}`}
                                        >
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
                                                ) : reg.status === "ready" ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full border border-indigo-200">
                                                        <UserCheck className="w-3 h-3" /> Бэлэн
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
                                            {/* Оноо (дүн гарсан) эсвэл явц (шалгалт өгч байгаа) */}
                                            <td className="px-6 py-4 text-center">
                                                {result ? (
                                                    <span className="font-bold text-slate-800">
                                                        {result.score}<span className="text-slate-400">/{result.maxScore}</span>
                                                    </span>
                                                ) : isRunning ? (
                                                    <div
                                                        className="flex flex-col items-center gap-1 min-w-[7.5rem] cursor-help"
                                                        title="Сурагчийн браузер ~1 минут тутам хадгалдаг тул явц 1 хүртэл минут хоцорч болно"
                                                    >
                                                        <span className="text-[11px] font-bold text-indigo-700">
                                                            хариулсан {answered}<span className="text-indigo-400">/{totalQuestions}</span>
                                                        </span>
                                                        <div className="w-28 h-2 rounded-full bg-indigo-100 overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-500 ease-out"
                                                                style={{ width: `${progressPct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-indigo-500">
                                                            {progressPct}% • ~1 мин тутам
                                                        </span>
                                                    </div>
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
                                                {results[reg.studentId]?.invalidatedByViolation ? (
                                                    <span
                                                        className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-full border border-amber-300"
                                                        title="Дүрэм зөрчсөн тул дүн эргэлзээтэй — «Дүн» хуудсаас шийднэ"
                                                    >
                                                        <ShieldAlert className="w-3 h-3" /> зөрчилтэй
                                                    </span>
                                                ) : results[reg.studentId]?.rank ? (
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
                                                    {startedAt && reg.status === "registered" && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={nudgingId === reg.studentId}
                                                            onClick={() => handleAdmit(reg.studentId, `${user.lastName || ""} ${user.firstName || ""}`.trim() || reg.studentId)}
                                                            className="text-indigo-600 hover:bg-indigo-50 gap-1"
                                                            title="Хоцорсон сурагчийг шалгалт руу оруулах"
                                                        >
                                                            <DoorOpen className="w-3.5 h-3.5" /> Оруулах
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={reg.status !== "completed" && !results[reg.studentId]}
                                                        onClick={() => setDetailFor({
                                                            studentId: reg.studentId,
                                                            name: `${user.lastName || ""} ${user.firstName || ""}`.trim() || reg.studentId,
                                                        })}
                                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1"
                                                        title="Асуулт бүрийн хариултыг харах"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" /> Хариулт
                                                    </Button>
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

            {detailFor && (
                <SubmissionDetailModal
                    examId={examId}
                    studentId={detailFor.studentId}
                    studentName={detailFor.name}
                    exam={exam}
                    onClose={() => setDetailFor(null)}
                />
            )}
        </div>
    );
}
