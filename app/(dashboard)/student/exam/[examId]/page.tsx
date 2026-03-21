"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import MathRenderer from "@/components/exam/MathRenderer";
import { toast } from "sonner";
import { ExamService } from "@/lib/services/exam-service";
import { useServerTime, getServerTimeValue } from "@/hooks/useServerTime";
import { ExamQuestion } from "@/types";
import { AlertTriangle, Clock, Send, ChevronLeft, ChevronRight, CheckCircle, Loader2 } from "lucide-react";

const AUTOSAVE_KEY = (examId: string, uid: string) => `exam_draft_${examId}_${uid}`;
const MAX_VIOLATIONS = 3;

interface ExamMeta {
    title: string;
    duration: number;
    grade: string;
    scheduledAt: number;
    registrationId: string;
    registrationStatus: string;
}

export default function ExamPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const params = useParams();
    const examId = params.examId as string;
    const router = useRouter();

    // Initialize server time hook to ensure global offset is calculated
    useServerTime();

    const [meta, setMeta] = useState<ExamMeta | null>(null);
    const [questions, setQuestions] = useState<ExamQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [currentIdx, setCurrentIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [started, setStarted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [violations, setViolations] = useState(0);
    const [showViolationWarning, setShowViolationWarning] = useState(false);
    const [preloading, setPreloading] = useState(false);
    const [preloadCountdown, setPreloadCountdown] = useState(15);

    const violationsRef = useRef(0);
    const submittedRef = useRef(false);
    const startedRef = useRef(false);
    const answersRef = useRef(answers);
    const handleSubmitRef = useRef<() => void>(() => {});
    // ✅ OPTIMIZATION: track last-saved snapshot so we skip the Firestore write
    // when the student hasn't changed any answer since the previous autosave.
    const lastSavedAnswersRef = useRef<string>("");

    useEffect(() => { answersRef.current = answers; }, [answers]);

    // ── Load saved draft from localStorage ─────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const saved = localStorage.getItem(AUTOSAVE_KEY(examId, user.uid));
        if (saved) {
            try { setAnswers(JSON.parse(saved)); } catch { /* ignore */ }
        }
    }, [examId, user]);

    // ── Autosave answers every 30 seconds (only if changed) ──────────────────
    useEffect(() => {
        if (!started || !user) return;
        const interval = setInterval(() => {
            const currentAnswers = answersRef.current;
            const serialized = JSON.stringify(currentAnswers);
            // Skip both localStorage and Firestore write if nothing changed
            if (serialized === lastSavedAnswersRef.current) return;
            lastSavedAnswersRef.current = serialized;
            localStorage.setItem(AUTOSAVE_KEY(examId, user.uid), serialized);
            ExamService.saveDraftAnswers(user.uid, examId, currentAnswers).catch(() => {});
        }, 30_000);
        return () => clearInterval(interval);
    }, [started, examId, user]);

    // ── Prevent accidental window close ────────────────────────────────────
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (started && !submittedRef.current) {
                e.preventDefault();
                e.returnValue = "Та шалгалтаа дуусгаагүй гарахад хариу устах эрсдэлтэй. Итгэлтэй байна уу?";
                return e.returnValue;
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [started]);

    // ── Auth guard ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!authLoading && !user) router.push("/login");
    }, [user, authLoading, router]);

    // ── Check if already submitted & Load Draft ────────────────────────────
    useEffect(() => {
        if (!user) return;
        ExamService.getSubmissionByStudent(examId, user.uid).then(existing => {
            if (existing) {
                setSubmitted(true);
                submittedRef.current = true;
            }
        });
        
        ExamService.getStudentRegistration(user.uid, examId).then(reg => {
            if (reg?.draftAnswers) {
                setAnswers(prev => ({ ...prev, ...reg.draftAnswers }));
            }
            if (reg?.status === "started") {
                setStarted(true);
                startedRef.current = true;
            }
            if (reg?.violations) {
                violationsRef.current = reg.violations;
                setViolations(reg.violations);
            }
        }).catch(() => {});
    }, [examId, user]);

    // ── Fetch questions via secure API route ───────────────────────────────
    useEffect(() => {
        if (authLoading || !user) return;

        const fetchQuestions = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/exam/${examId}/questions`);
                if (!res.ok) {
                    const data = await res.json();
                    setError(data.error || "Шалгалт ачаалахад алдаа гарлаа");
                    return;
                }
                const data = await res.json();
                setMeta({
                    title: data.title,
                    duration: data.duration,
                    grade: data.grade,
                    scheduledAt: data.scheduledAt,
                    registrationId: data.registrationId,
                    registrationStatus: data.registrationStatus,
                });
                setQuestions(data.questions);
                // #2 FIX: Compute remaining time from real scheduledAt so a late
                // page-load or reload shows the correct countdown, not full duration.
                const examEndMs = data.scheduledAt + data.duration * 60_000;
                const remaining = Math.floor((examEndMs - getServerTimeValue()) / 1000);
                setTimeLeft(Math.max(0, remaining));
            } catch {
                setError("Сервертэй холбогдоход алдаа гарлаа");
            } finally {
                setLoading(false);
            }
        };

        fetchQuestions();
    }, [examId, user, authLoading]);


    // ── Submit exam ────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (submittedRef.current || !user || !meta) return;
        submittedRef.current = true;
        setSubmitting(true);

        try {
            const studentName = profile
                ? `${profile.lastName} ${profile.firstName}`.trim()
                : (user.email ?? user.uid);

            const timeTaken = meta.duration * 60 - timeLeft;

            const res = await fetch(`/api/exam/${examId}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers, timeTaken, studentName })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Алдаа гарлаа");
            }

            localStorage.removeItem(AUTOSAVE_KEY(examId, user.uid));
            setSubmitted(true);
            toast.success("Шалгалт амжилттай илгээгдлээ! Дүн тооцоологдох болно.");
        } catch (err) {
            submittedRef.current = false;
            console.error("Submission failed", err);
            toast.error("Илгээхэд алдаа гарлаа. Дахин оролдоно уу.");
        } finally {
            setSubmitting(false);
        }
    }, [user, profile, examId, answers, timeLeft, meta]);

    // Keep ref in sync with the latest handleSubmit so timer never calls stale version
    useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

    // ── Countdown timer ────────────────────────────────────────────────────
    useEffect(() => {
        if (!started || submittedRef.current || !meta) return;
        if (timeLeft <= 0) {
            toast.error("Хугацаа дууслаа! Шалгалт автоматаар илгээгдлээ.");
            handleSubmitRef.current();
            return;
        }

        const examEndMs = meta.scheduledAt + meta.duration * 60_000;

        const timer = setInterval(() => {
            const remaining = Math.floor((examEndMs - getServerTimeValue()) / 1000);
            if (remaining <= 0) {
                clearInterval(timer);
                setTimeLeft(0);
                if (!submittedRef.current) {
                    toast.error("Хугацаа дууслаа! Шалгалт автоматаар илгээгдлээ.");
                    handleSubmitRef.current();
                }
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);

        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [started, meta]); // ✅ removed handleSubmit dependency — using ref instead
    
    // ── 15s Preload Countdown ──────────────────────────────────────────────
    useEffect(() => {
        if (!preloading) return;
        if (preloadCountdown <= 0) {
             setPreloading(false);
             setStarted(true);
             startedRef.current = true;
             
             ExamService.startExam(user!.uid, examId).catch(() => {});
             
             ExamService.getStudentRegistration(user!.uid, examId).then(reg => {
                 if (reg && reg.violations) {
                     violationsRef.current = reg.violations;
                     setViolations(reg.violations);
                 }
             }).catch(() => {});
             return;
        }
        
        const timer = setTimeout(() => {
             setPreloadCountdown(prev => prev - 1);
        }, 1000);
        
        return () => clearTimeout(timer);
    }, [preloading, preloadCountdown, user, examId]);

    // ── Anti-cheating: tab switch detection ────────────────────────────────
    const handleVisibilityChange = useCallback(async () => {
        if (!startedRef.current || submittedRef.current || !user) return;
        if (document.hidden) {
            const newCount = violationsRef.current + 1;
            violationsRef.current = newCount;
            setViolations(newCount);

            // Record in Firestore
            await ExamService.recordViolation(user.uid, examId).catch(() => null);

            if (newCount >= MAX_VIOLATIONS) {
                toast.error("Хуулах оролдлого хэт олон удаа бүртгэгдлээ. Шалгалт автоматаар дуусав.");
                handleSubmit();
            } else {
                setShowViolationWarning(true);
                setTimeout(() => setShowViolationWarning(false), 4000);
                toast.warning(`Анхааруулга: Цонх солилт бүртгэгдлээ (${newCount}/${MAX_VIOLATIONS})`);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, examId]);

    // ── Anti-cheating: disable right-click & shortcuts ─────────────────────
    useEffect(() => {
        if (!started) return;

        const onContextMenu = (e: MouseEvent) => e.preventDefault();
        const onKeyDown = (e: KeyboardEvent) => {
            // Block F12, DevTools, copy shortcuts
            if (
                e.key === "F12" ||
                (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) ||
                (e.ctrlKey && e.key === "u")
            ) {
                e.preventDefault();
            }
        };

        document.addEventListener("contextmenu", onContextMenu);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener("contextmenu", onContextMenu);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [started, handleVisibilityChange]);

    // ── Start exam ─────────────────────────────────────────────────────────
    const handleStart = async () => {
        if (!user || !meta) return;
        setPreloading(true);
    };



    // ─── Helpers ─────────────────────────────────────────────────────────────
    const formatTime = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
        return `${m}:${String(sec).padStart(2, "0")}`;
    };

    const answeredCount = questions.filter(q => answers[q.id]?.trim()).length;

    // ─── Render: loading / error ──────────────────────────────────────────────
    if (loading || authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-slate-500 font-medium">Шалгалт ачаалж байна...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="p-8 text-center space-y-4">
                        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
                        <h2 className="text-xl font-bold text-slate-800">{error}</h2>
                        <Button onClick={() => router.push("/student")} variant="outline">
                            Буцах
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ─── Render: already submitted ────────────────────────────────────────────
    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="p-8 text-center space-y-6">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle className="w-10 h-10 text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 mb-2">Шалгалт илгээгдлээ!</h2>
                            <p className="text-slate-500">Таны хариулт хадгалагдсан. Дүн тооцоологдсоны дараа харагдах болно.</p>
                        </div>
                        <Button onClick={() => router.push("/student")} className="w-full bg-blue-600 text-white">
                            Хянах самбар руу буцах
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!meta) return null;

    // ─── Render: preloading screen ────────────────────────────────────────────
    if (preloading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="max-w-md w-full shadow-2xl overflow-hidden">
                    <CardHeader className="bg-linear-to-r from-blue-600 to-indigo-600 text-white text-center p-8">
                        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
                        <CardTitle className="text-2xl font-black">Шалгалт бэлтгэж байна...</CardTitle>
                        <p className="text-blue-100 mt-2">Асуулт болон зургуудыг ачаалж байна</p>
                    </CardHeader>
                    <CardContent className="p-8 text-center space-y-6">
                        <div className="text-7xl font-black text-blue-600">
                            {preloadCountdown}
                        </div>
                        <p className="font-bold text-slate-500 uppercase tracking-widest text-sm">
                            секунд хүлээнэ үү
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ─── Render: intro screen ─────────────────────────────────────────────────
    if (!started) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="max-w-lg w-full shadow-2xl">
                    <CardHeader className="bg-linear-to-r from-blue-600 to-indigo-600 text-white rounded-t-xl p-8">
                        <CardTitle className="text-2xl font-black">{meta.title}</CardTitle>
                        <p className="text-blue-100 mt-1">{meta.grade}-р анги</p>
                    </CardHeader>
                    <CardContent className="p-8 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <Clock className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                                <div className="text-2xl font-black text-slate-800">{meta.duration}</div>
                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Минут</div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                                <div className="text-2xl font-black text-slate-800">{questions.length}</div>
                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Асуулт</div>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                            <p className="font-bold text-amber-800 text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Анхааруулга
                            </p>
                            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                                <li>Шалгалтын үед өөр цонх нээвэл бүртгэгдэнэ ({MAX_VIOLATIONS} удаа бол автоматаар дуусна)</li>
                                <li>Хуулах (Ctrl+C/V) хориглоно</li>
                                <li>Хугацаа дуусахад автоматаар илгээгдэнэ</li>
                                <li>30 секунд тутамд хариулт автоматаар хадгалагдана</li>
                            </ul>
                        </div>

                        <Button
                            onClick={handleStart}
                            className="w-full h-14 bg-linear-to-r from-blue-600 to-indigo-600 text-white font-black text-lg rounded-2xl shadow-xl"
                        >
                            Шалгалт эхлэх
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ─── Render: exam in progress ─────────────────────────────────────────────
    const currentQ = questions[currentIdx];

    return (
        <div className="min-h-screen bg-gray-50 select-none" onCopy={e => e.preventDefault()} onPaste={e => e.preventDefault()}>
            {/* Violation warning banner */}
            {showViolationWarning && (
                <div className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white text-center py-3 font-bold animate-bounce">
                    ⚠️ Цонх солих оролдлого бүртгэгдлээ! ({violations}/{MAX_VIOLATIONS})
                </div>
            )}

            {/* Sticky header */}
            <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <h1 className="font-black text-slate-900 truncate">{meta.title}</h1>
                        <p className="text-xs text-slate-500">
                            Хариулсан: {answeredCount}/{questions.length}
                        </p>
                    </div>

                    <div className={`font-mono font-black text-xl px-4 py-2 rounded-xl border-2 ${timeLeft < 300 ? "bg-red-50 border-red-300 text-red-600 animate-pulse" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
                        <Clock className="w-4 h-4 inline mr-1 -mt-0.5" />
                        {formatTime(timeLeft)}
                    </div>

                    <Button
                        onClick={() => {
                            if (window.confirm(`${questions.length - answeredCount} асуулт хариулаагүй байна. Шалгалтаа илгээх үү?`)) {
                                handleSubmit();
                            }
                        }}
                        disabled={submitting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shrink-0"
                    >
                        <Send className="w-4 h-4" />
                        {submitting ? "Илгээж байна..." : "Илгээх"}
                    </Button>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 bg-slate-100">
                    <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                    />
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="grid lg:grid-cols-4 gap-6">
                    {/* Question navigator sidebar */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 bg-white rounded-2xl border border-slate-200 p-4">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Асуултуудын жагсаалт</p>
                            <div className="grid grid-cols-5 lg:grid-cols-4 gap-1.5">
                                {questions.map((q, i) => (
                                    <button
                                        key={q.id}
                                        onClick={() => setCurrentIdx(i)}
                                        className={`w-full aspect-square rounded-lg text-xs font-black transition-all ${
                                            i === currentIdx
                                                ? "bg-blue-600 text-white shadow-lg scale-110"
                                                : answers[q.id]?.trim()
                                                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                        }`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 space-y-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
                                    Хариулсан
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-slate-100" />
                                    Хариулаагүй
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Current question */}
                    <div className="lg:col-span-3">
                        {currentQ && (
                            <Card className="shadow-lg border-0 rounded-3xl overflow-hidden">
                                <CardHeader className="bg-slate-50 border-b border-slate-100 px-8 py-5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                                            Асуулт {currentIdx + 1} / {questions.length}
                                        </span>
                                        <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                                            {currentQ.points} оноо
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-8 space-y-6">
                                    {/* Question content */}
                                    <div className="text-lg font-bold text-slate-800 leading-relaxed">
                                        <MathRenderer content={currentQ.content} />
                                    </div>

                                    {/* Media */}
                                    {currentQ.mediaUrl && (
                                        <div className="rounded-2xl overflow-hidden border border-slate-100">
                                            {currentQ.mediaType === "image" && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={currentQ.mediaUrl} loading="lazy" alt="Асуултын зураг" className="max-w-full h-auto max-h-64 object-contain mx-auto" />
                                            )}
                                            {currentQ.mediaType === "audio" && (
                                                <audio controls src={currentQ.mediaUrl} className="w-full p-4" />
                                            )}
                                            {currentQ.mediaType === "video" && (
                                                <video controls src={currentQ.mediaUrl} className="w-full max-h-64" />
                                            )}
                                        </div>
                                    )}

                                    {/* Multiple choice options */}
                                    {currentQ.type === "multiple_choice" && currentQ.options && (
                                        <div className="space-y-3">
                                            {currentQ.options.map((opt, idx) => {
                                                const letter = String.fromCharCode(65 + idx); // A, B, C, D
                                                const isSelected = answers[currentQ.id] === opt;
                                                return (
                                                    <label
                                                        key={idx}
                                                        className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                                                            isSelected
                                                                ? "border-blue-500 bg-blue-50 shadow-md"
                                                                : "border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30"
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={currentQ.id}
                                                            value={opt}
                                                            checked={isSelected}
                                                            onChange={() => setAnswers(prev => ({ ...prev, [currentQ.id]: opt }))}
                                                            className="sr-only"
                                                        />
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 transition-all ${
                                                            isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                                                        }`}>
                                                            {letter}
                                                        </div>
                                                        <div className="flex-1 pt-1 font-medium text-slate-700">
                                                            <MathRenderer content={opt} />
                                                            {currentQ.optionImages?.[idx] && (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img src={currentQ.optionImages[idx]} loading="lazy" alt={`Option ${letter}`} className="mt-2 max-h-24 object-contain" />
                                                            )}
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Input answer */}
                                    {currentQ.type !== "multiple_choice" && (
                                        <div className="space-y-4">
                                            {currentQ.type === "fill_in_blank" && (
                                                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl text-sm text-blue-800 font-medium">
                                                    💡 Санамж: Дээрх асуултын агуулга дахь хоосон зайд тохирох зөв хариултаа доорх нүдэнд бичнэ үү.
                                                </div>
                                            )}
                                            <textarea
                                                className="w-full border-2 border-slate-200 rounded-2xl p-4 text-slate-800 font-medium focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none text-lg"
                                                rows={currentQ.type === "fill_in_blank" ? 2 : 4}
                                                placeholder={currentQ.type === "fill_in_blank" ? "Хоосон зайд нөхөх үгээ энд бичнэ үү..." : "Хариултаа энд бичнэ үү..."}
                                                value={answers[currentQ.id] || ""}
                                                onChange={e => setAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                                            />
                                        </div>
                                    )}

                                    {/* Navigation */}
                                    <div className="flex justify-between pt-4">
                                        <Button
                                            variant="outline"
                                            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                                            disabled={currentIdx === 0}
                                            className="gap-2"
                                        >
                                            <ChevronLeft className="w-4 h-4" /> Өмнөх
                                        </Button>
                                        {currentIdx < questions.length - 1 ? (
                                            <Button
                                                onClick={() => setCurrentIdx(i => i + 1)}
                                                className="gap-2 bg-blue-600 text-white"
                                            >
                                                Дараах <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={() => {
                                                    if (window.confirm(`${questions.length - answeredCount} асуулт хариулаагүй байна. Шалгалтаа илгээх үү?`)) {
                                                        handleSubmit();
                                                    }
                                                }}
                                                className="gap-2 bg-emerald-600 text-white"
                                                disabled={submitting}
                                            >
                                                <Send className="w-4 h-4" />
                                                {submitting ? "Илгээж байна..." : "Шалгалт илгээх"}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
