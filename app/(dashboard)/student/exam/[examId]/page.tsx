"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import MathRenderer from "@/components/exam/MathRenderer";
import { toast } from "sonner";
import { ExamService } from "@/lib/services/exam-service";
import { RetakeService } from "@/lib/services/retake-service";
import { useServerTime, getServerTimeValue, offsetReadyPromise } from "@/hooks/useServerTime";
import { ExamQuestion, Registration } from "@/types";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { AlertTriangle, Clock, Send, ChevronLeft, ChevronRight, CheckCircle, Loader2, Maximize, RotateCcw } from "lucide-react";
import ExamSupportChat from "@/components/exam/ExamSupportChat";
import { useConfirm } from "@/components/providers/ModalProvider";
import { requestFullscreen, exitFullscreen, isFullscreenActive, onFullscreenChange } from "@/lib/fullscreen";

const AUTOSAVE_KEY = (examId: string, uid: string) => `exam_draft_${examId}_${uid}`;

/** Тоон хариулт хүлээж буй асуулт эсэх. Сервер `answerFormat`-ыг хариултын
 *  түлхүүрээс тооцож дамжуулдаг (зөв хариу задардаггүй). */
/** Админаас сануулга ирэхэд богино дуут дохио (файлгүй, WebAudio). */
function playAlertSound() {
    try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        [0, 0.22].forEach(delay => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = "square";
            osc.frequency.setValueAtTime(760, ctx.currentTime + delay);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.18);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + 0.2);
        });
        setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch { /* дуугүй ч ажиллана */ }
}

const isNumericAnswer = (q: ExamQuestion) =>
    q.type !== "multiple_choice" && (q.answerFormat === "number" || q.answerFormat === "fraction");
const MAX_VIOLATIONS = 3;

interface ExamMeta {
    title: string;
    duration: number;
    grade: string;
    scheduledAt: number | null;
    registrationId: string;
    registrationStatus: string;
    passingScore?: number;
}

export default function ExamPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const params = useParams();
    const examId = params.examId as string;
    const router = useRouter();
    const confirm = useConfirm();

    // Initialize server time hook to ensure global offset is calculated
    useServerTime();

    const [meta, setMeta] = useState<ExamMeta | null>(null);
    const [questions, setQuestions] = useState<ExamQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [currentIdx, setCurrentIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [isOfflineRetrying, setIsOfflineRetrying] = useState(false);
    const [started, setStarted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submitFailed, setSubmitFailed] = useState(false);
    const [violations, setViolations] = useState(0);
    const [showViolationWarning, setShowViolationWarning] = useState(false);
    // ── Хүлээх танхим ────────────────────────────────────────────────────
    /** Сурагч «Бэлэн боллоо» дарсан эсэх. */
    const [isReady, setIsReady] = useState(false);
    const [readySubmitting, setReadySubmitting] = useState(false);
    /** Админ шалгалтыг эхлүүлсэн мөч (сервер дата). Энэ тавигдтал шалгалт эхлэхгүй. */
    const [examStartedAt, setExamStartedAt] = useState<number | null>(null);
    /** Шалгалтын үндсэн мэдээлэл (хүлээх танхимд харуулах). */
    const [examInfo, setExamInfo] = useState<{ title: string; duration: number; grade: string; scheduledAt: number | null } | null>(null);
    /** Админаас ирсэн сануулга — дэлгэц дүүрэн анхааруулга. */
    const [nudge, setNudge] = useState(false);

    const [liveReg, setLiveReg] = useState<Registration | null>(null);
    const [retakeRequested, setRetakeRequested] = useState(false);
    const [acknowledgedRules, setAcknowledgedRules] = useState(false);
    // FIX E1: Retake reason modal
    const [showRetakeDialog, setShowRetakeDialog] = useState(false);
    const [retakeReason, setRetakeReason] = useState("");
    // FIX 16: Question report modal — replaces window.prompt with a proper UI
    const [reportingQuestionId, setReportingQuestionId] = useState<string | null>(null);
    const [reportReason, setReportReason] = useState("");
    const [reportSubmitting, setReportSubmitting] = useState(false);
    // FIX E2: Capture submit result so we can show score on the success screen
    const [submitResult, setSubmitResult] = useState<{ score: number; percentage: number; passed: boolean; invalidatedByViolation?: boolean } | null>(null);
    // ── Бүтэн дэлгэц (fullscreen) төлөв ────────────────────────────────────
    const [isFullscreen, setIsFullscreen] = useState(false);
    // Сурагч бүтэн дэлгэцээс гарсан үед гарах анхааруулах самбар
    const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);

    const violationsRef = useRef(0);
    const answeredCountRef = useRef(0);
    const submittedRef = useRef(false);
    const startedRef = useRef(false);
    const answersRef = useRef(answers);
    const handleSubmitRef = useRef<() => void>(() => {});
    const submitAttemptsRef = useRef(0);
    // FIX 2: Track the real wall-clock start time to compute accurate timeTaken.
    // Using Date.now() at submit time avoids the stale-closure issue with timeLeft state.
    const examStartedAtRef = useRef<number>(0);
    // A5: Fallback start time pulled from the registration's startedAt so that reloaders
    // get an accurate timeTaken instead of being credited the full duration.
    const regStartedAtRef = useRef<number>(0);
    // ✅ OPTIMIZATION: track last-saved snapshot so we skip the Firestore write
    // when the student hasn't changed any answer since the previous autosave.
    const lastSavedAnswersRef = useRef<string>("");
    // A2: Stable shuffled option ordering per question (keyed by question id) so that
    // re-renders don't reshuffle options mid-question.
    const shuffledOptionsRef = useRef<Record<string, number[]>>({});
    // Бүтэн дэлгэц НЭГ Ч УДАА амжилттай асаагдсан эсэх. Зөвхөн энэ тохиолдолд л
    // дараа нь гарахад анхааруулах самбар харуулна (эхнээсээ татгалзсан/дэмжээгүй
    // browser дээр сурагчийг хаахгүй).
    const fullscreenEngagedRef = useRef(false);
    /** Сүүлд харсан сануулгын мөч — давхар дуугаргахгүйн тулд. */
    const lastNudgeRef = useRef<number>(0);

    useEffect(() => { answersRef.current = answers; }, [answers]);

    // ── Шалгалтын доккументийг сонсох: админ эхлүүлмэгц бүх сурагчид зэрэг эхэлнэ ──
    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(doc(db, "exams", examId), d => {
            if (!d.exists()) return;
            const e = d.data();
            const startedMs = e.startedAt?.toMillis?.() ?? null;
            setExamInfo({
                title: e.title || "Шалгалт",
                duration: e.duration || 60,
                grade: e.grade || "",
                scheduledAt: e.scheduledAt?.toMillis?.() ?? null,
            });
            setExamStartedAt(prev => {
                if (!prev && startedMs) toast.success("Шалгалт эхэллээ!");
                return startedMs;
            });
        }, err => console.error("[exam listener]", err));
        return () => unsub();
    }, [examId, user]);

    // ── Live listener to handle admin forced updates ───────────────────────
    useEffect(() => {
        if (!meta?.registrationId) return;
        const unsub = onSnapshot(doc(db, "registrations", meta.registrationId), (d) => {
            if (d.exists()) {
                const data = d.data() as Registration;
                setLiveReg(data);
                // Админаас ирсэн сануулга
                const nudgedMs = (data.nudgedAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
                if (nudgedMs && nudgedMs > lastNudgeRef.current) {
                    lastNudgeRef.current = nudgedMs;
                    setNudge(true);
                    playAlertSound();
                }
                // Force submit from admin
                if (data.forceSubmitted && !submittedRef.current) {
                    toast.error("Шалгалт админаас хүчээр дуусгагдлаа!");
                    handleSubmitRef.current();
                }
            }
        });
        return () => unsub();
    }, [meta?.registrationId]);

    // ── Load saved draft from localStorage ─────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const saved = localStorage.getItem(AUTOSAVE_KEY(examId, user.uid));
        if (saved) {
            try { setAnswers(JSON.parse(saved)); } catch { /* ignore */ }
        }
    }, [examId, user]);

    // ── Autosave answers every 60 seconds (only if changed) ──────────────────
    useEffect(() => {
        if (!started || !user) return;
        const interval = setInterval(() => {
            const currentAnswers = answersRef.current;
            const serialized = JSON.stringify(currentAnswers);
            // Skip localStorage write if nothing changed
            if (serialized === lastSavedAnswersRef.current) return;
            lastSavedAnswersRef.current = serialized;
            localStorage.setItem(AUTOSAVE_KEY(examId, user.uid), serialized);
            // Only write to Firestore if answers changed since last save
            ExamService.saveDraftAnswers(user.uid, examId, currentAnswers).catch(() => {});
        }, 60_000);
        return () => {
            clearInterval(interval);
            // Final save on unmount
            ExamService.saveDraftAnswers(user.uid, examId, answersRef.current).catch(console.error);
        };
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
            // A5: Capture the server-side startedAt so that a reloader's timeTaken
            // is computed from the actual exam start, not from full duration.
            if (reg?.startedAt) {
                const startedMs = reg.startedAt instanceof Date
                    ? reg.startedAt.getTime()
                    : new Date(reg.startedAt as unknown as string | number).getTime();
                if (!Number.isNaN(startedMs)) {
                    regStartedAtRef.current = startedMs;
                }
            }
        }).catch(() => {});
    }, [examId, user]);

    // ── FIX 17: Check for existing retake request on mount to prevent duplicates ──
    useEffect(() => {
        if (!user?.uid || !examId) return;
        RetakeService.getStudentRequest(user.uid, examId)
            .then(existing => {
                if (existing) setRetakeRequested(true);
            })
            .catch(() => {});
    }, [user?.uid, examId]);

    // ── Fetch questions via secure API route ───────────────────────────────
    // Зөвхөн админ шалгалтыг эхлүүлсний ДАРАА асуулт татна. Түүнээс өмнө
    // сервер 403 (notStarted) буцаадаг тул хүлээх танхим харагдана.
    useEffect(() => {
        if (authLoading || !user) return;
        if (!examStartedAt) { setLoading(false); return; }

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
                    scheduledAt: data.scheduledAt ?? null,
                    registrationId: data.registrationId,
                    registrationStatus: data.registrationStatus,
                    passingScore: data.passingScore,
                });
                // Шалгалт эхэлсэн тул шууд ажиллуулна
                setStarted(true);
                startedRef.current = true;
                if (examStartedAtRef.current === 0) examStartedAtRef.current = data.startedAt || Date.now();
                // A2: Don't pre-shuffle options here on every fetch. We compute and cache
                // a stable shuffled order per-question via getShuffledOptions() below so
                // that the student sees the same option order across re-renders.
                setQuestions(data.questions as ExamQuestion[]);
                // Үлдсэн хугацааг СЕРВЕРИЙН эхлүүлсэн мөчөөс тооцно — бүх сурагчид ижил.
                const examEndMs = (data.startedAt || examStartedAt) + data.duration * 60_000;
                const remaining = Math.floor((examEndMs - getServerTimeValue()) / 1000);
                setTimeLeft(Math.max(0, remaining));
            } catch {
                setError("Сервертэй холбогдоход алдаа гарлаа");
            } finally {
                setLoading(false);
            }
        };

        fetchQuestions();
    }, [examId, user, authLoading, examStartedAt]);

    // ── FIX 13: Re-compute timeLeft once server offset is known ───────────────
    // If fetchQuestions ran before the NTP offset resolved, getServerTimeValue()
    // returned local time (offset = 0). Once the offset promise resolves we
    // recalculate the remaining time using the corrected server clock.
    useEffect(() => {
        let cancelled = false;
        offsetReadyPromise.then(() => {
            if (cancelled) return;
            setMeta(prevMeta => {
                if (!prevMeta || !examStartedAt) return prevMeta;
                const examEndMs = examStartedAt + prevMeta.duration * 60_000;
                const remaining = Math.floor((examEndMs - getServerTimeValue()) / 1000);
                setTimeLeft(Math.max(0, remaining));
                return prevMeta;
            });
        });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const MAX_SUBMIT_ATTEMPTS = 3;
    const SUBMIT_DELAYS = [1000, 2000, 4000];

    // ── Submit exam ────────────────────────────────────────────────────────
    const attemptSubmit = useCallback(async (attempt: number = 1): Promise<void> => {
        if (!user || !meta) return;
        if (attempt > MAX_SUBMIT_ATTEMPTS) {
            submittedRef.current = false;
            setSubmitting(false);
            setIsOfflineRetrying(false);
            setSubmitFailed(true);
            toast.error("Серверт холбогдож чадсангүй. Дахин оролдоно уу эсвэл администратортай холбогдоно уу.");
            return;
        }
        try {
            const studentName = profile
                ? `${profile.lastName} ${profile.firstName}`.trim()
                : (user.email ?? user.uid);

            // FIX 2 / A5: Compute timeTaken from the real wall-clock start time.
            // Prefer the in-tab start (examStartedAtRef) and fall back to the
            // registration's server-side startedAt for reloaders. Only as a last
            // resort do we use the remaining-time fallback (which over-credits
            // students who reload mid-exam).
            const startMs = examStartedAtRef.current > 0
                ? examStartedAtRef.current
                : regStartedAtRef.current;
            const timeTaken = startMs > 0
                ? Math.floor((Date.now() - startMs) / 1000)
                : meta.duration * 60 - Math.max(0, timeLeft);

            // FIX 7: Use answersRef.current (always up-to-date) instead of the potentially
            // stale answers closure captured at the time the callback was created.
            const res = await fetch(`/api/exam/${examId}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers: answersRef.current, timeTaken, studentName })
            });

            // B3: Server (5xx) errors are transient — retry like a network error
            // before showing the failure screen.
            if (res.status >= 500 && attempt < MAX_SUBMIT_ATTEMPTS) {
                setIsOfflineRetrying(true);
                const delay = SUBMIT_DELAYS[attempt - 1] ?? 4000;
                toast.error(`Серверийн алдаа. Дахин оролдож байна... (${attempt}/${MAX_SUBMIT_ATTEMPTS})`);
                setTimeout(() => attemptSubmit(attempt + 1), delay);
                return;
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Алдаа гарлаа");
            }

            // FIX E2: Capture the score returned by the submit API so we can show it on the success screen.
            const data = await res.json().catch(() => ({}));
            if (typeof data?.score === "number" && typeof data?.percentage === "number") {
                setSubmitResult({
                    score: data.score,
                    percentage: data.percentage,
                    passed: !!data.passed,
                    invalidatedByViolation: !!data.invalidatedByViolation,
                });
            }

            submitAttemptsRef.current = 0;
            localStorage.removeItem(AUTOSAVE_KEY(examId, user.uid));
            setSubmitted(true);
            setIsOfflineRetrying(false);
            setSubmitting(false);
            setSubmitFailed(false);
            toast.success("Шалгалт амжилттай илгээгдлээ! Дүн тооцоологдох болно.");
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (errorMsg === "Failed to fetch" || errorMsg.includes("NetworkError") || (typeof navigator !== "undefined" && !navigator.onLine)) {
                setIsOfflineRetrying(true);
                const delay = SUBMIT_DELAYS[attempt - 1] ?? 4000;
                toast.error(`Сүлжээ тасарсан байна. Дахин оролдож байна... (${attempt}/${MAX_SUBMIT_ATTEMPTS})`);
                setTimeout(() => attemptSubmit(attempt + 1), delay);
            } else {
                submittedRef.current = false;
                setSubmitting(false);
                setIsOfflineRetrying(false);
                console.error("Submission failed", err);
                toast.error(errorMsg || "Илгээхэд алдаа гарлаа. Дахин баталгаажуулна уу.");
            }
        }
    }, [user, profile, examId, meta]); // answers and timeLeft removed: we now read answersRef.current and compute timeTaken from examStartedAtRef

    /** Илгээхийн өмнөх баталгаажуулалт — browser-ийн стандарт цонхны оронд
     *  аппын өөрийн модалыг ашиглана. */
    const confirmAndSubmit = useCallback(async () => {
        const unanswered = questions.length - answeredCountRef.current;
        const ok = await confirm({
            title: "Шалгалтаа илгээх үү?",
            message: unanswered > 0
                ? `${unanswered} асуулт хариулаагүй байна. Илгээсний дараа хариултаа засах боломжгүй.`
                : "Та бүх асуултад хариулсан байна. Илгээсний дараа хариултаа засах боломжгүй.",
            confirmLabel: "Тийм, илгээх",
            variant: unanswered > 0 ? "destructive" : "default",
        });
        if (ok) handleSubmitRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirm, questions.length]);

    const handleSubmit = useCallback(async () => {
        if (submittedRef.current || !user || !meta) return;
        submittedRef.current = true;
        setSubmitting(true);
        setIsOfflineRetrying(false);
        await attemptSubmit(1);
    }, [user, meta, attemptSubmit]);

    // Keep ref in sync with the latest handleSubmit so timer never calls stale version
    useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

    // ── Countdown timer ────────────────────────────────────────────────────
    useEffect(() => {
        if (!started || submittedRef.current || !meta) return;
        // FIX 6: Guard against double-submit when this effect re-runs because extendedTime
        // changed after the exam was already submitted. Without this guard, the effect
        // re-executes, sees timeLeft <= 0, and tries to submit again.
        if (timeLeft <= 0 && !submittedRef.current) {
            toast.error("Хугацаа дууслаа! Шалгалт автоматаар илгээгдлээ.");
            handleSubmitRef.current();
            return;
        }

        if (!examStartedAt) return;
        const examEndMs = examStartedAt + meta.duration * 60_000 + (liveReg?.extendedTime ? liveReg.extendedTime * 1000 : 0);

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
    }, [started, meta, liveReg?.extendedTime]); // ✅ added extendedTime so time updates natively
    
    // ── Anti-cheating: tab switch detection ────────────────────────────────
    // B4: Use ONLY the server-confirmed violation count as the authoritative
    // value. We no longer optimistically bump violationsRef before the server
    // responds — that caused two-count drift on flaky networks.
    const handleVisibilityChange = useCallback(async () => {
        if (!startedRef.current || submittedRef.current || !user) return;
        if (document.visibilityState !== "hidden") return;

        const serverCount = await ExamService.recordViolation(user.uid, examId).catch(() => null);
        if (serverCount === null) {
            console.warn("Violation Firestore write failed; not updating local count");
            return;
        }

        violationsRef.current = serverCount;
        setViolations(serverCount);

        if (serverCount >= MAX_VIOLATIONS) {
            // Хариултыг ЮУНЫ ӨМНӨ сервер рүү хадгална. Автомат хадгалалт 60
            // секунд тутам ажилладаг тул үүнгүйгээр сүүлийн 1 минутын ажил
            // алдагдах эрсдэлтэй. Дараа нь илгээнэ — сервер илгээлтийг хүлээж
            // авах ба дүнг нь "зөрчилтэй" гэж тэмдэглэнэ.
            try {
                await ExamService.saveDraftAnswers(user.uid, examId, answersRef.current);
            } catch (err) {
                console.error("Зөрчлийн үеийн draft хадгалалт амжилтгүй", err);
            }
            toast.error("Дүрэм зөрчсөн тул шалгалт автоматаар дуусч, хариулт илгээгдлээ");
            setShowViolationWarning(true);
            handleSubmitRef.current();
        } else {
            setShowViolationWarning(true);
            setTimeout(() => setShowViolationWarning(false), 4000);
            toast.warning(`Анхааруулга: Цонх солилт бүртгэгдлээ (${serverCount}/${MAX_VIOLATIONS})`);
        }
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

    // ── Бүтэн дэлгэцийн өөрчлөлтийг сонсох ─────────────────────────────────
    // ЧУХАЛ: Fullscreen-ээс гарахыг дүрэм зөрчилд (violations) НЭМЭХГҮЙ.
    // Энэ нь зөвхөн анхааруулга бөгөөд шалгалтыг зогсоохгүй.
    useEffect(() => {
        if (!started) return;

        const syncFullscreenState = () => {
            const active = isFullscreenActive();
            setIsFullscreen(active);
            if (active) {
                setShowFullscreenPrompt(false);
            } else if (fullscreenEngagedRef.current && !submittedRef.current) {
                setShowFullscreenPrompt(true);
            }
        };

        syncFullscreenState();
        return onFullscreenChange(syncFullscreenState);
    }, [started]);

    // ── Илгээсний дараа бүтэн дэлгэцээс гарах ──────────────────────────────
    useEffect(() => {
        if (!submitted) return;
        setShowFullscreenPrompt(false);
        void exitFullscreen();
    }, [submitted]);

    // ── Компонент unmount хийгдэхэд бүтэн дэлгэцээс гарах ──────────────────
    useEffect(() => {
        return () => { void exitFullscreen(); };
    }, []);

    // ── Бүтэн дэлгэц рүү буцах (ЗААВАЛ хэрэглэгчийн товшилтоос дуудагдана) ──
    const handleReenterFullscreen = async () => {
        const ok = await requestFullscreen();
        if (ok) {
            fullscreenEngagedRef.current = true;
            setIsFullscreen(true);
            setShowFullscreenPrompt(false);
        } else {
            toast.warning("Бүтэн дэлгэц рүү шилжиж чадсангүй. Browser-ийн зөвшөөрлөө шалгана уу.");
        }
    };

    // ── Start exam ─────────────────────────────────────────────────────────
    /** «Бэлэн боллоо» — бүтэн дэлгэц асааж, серверт бэлэн болсноо мэдэгдэнэ.
     *  Шалгалт ЭНД эхлэхгүй: админ «Бүгдэд эхлүүлэх» дарахыг хүлээнэ. */
    const handleReady = async () => {
        if (!user) return;

        // ⚠️ requestFullscreen-ыг товшилтын дотор, ямар нэг await-аас ӨМНӨ дуудна.
        const fullscreenPromise = requestFullscreen();
        setReadySubmitting(true);
        try {
            const res = await fetch(`/api/exam/${examId}/ready`, { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error || "Бэлэн болсныг бүртгэхэд алдаа гарлаа");
                return;
            }
            setIsReady(true);
            toast.success("Бэлэн боллоо. Багш эхлүүлэхийг хүлээнэ үү.");
        } catch (err) {
            console.error("[ready]", err);
            toast.error("Сервертэй холбогдож чадсангүй");
        } finally {
            setReadySubmitting(false);
        }

        const fullscreenOk = await fullscreenPromise;
        if (fullscreenOk) {
            fullscreenEngagedRef.current = true;
            setIsFullscreen(true);
        } else {
            toast.warning("Бүтэн дэлгэц асаагдсангүй. Шалгалт үргэлжилнэ, гэхдээ бүтэн дэлгэц дээр өгөхийг зөвлөж байна.");
        }
    };



    // ─── Helpers ─────────────────────────────────────────────────────────────
    // A2: Stable per-session shuffle of multiple-choice options. The order is
    // computed lazily the first time we render a question and cached in a ref
    // so subsequent re-renders return the same order. Each entry returns the
    // option text + image and the original index (so the answer we store is
    // still the original option TEXT — grading is unaffected).
    const getShuffledOptions = (question: ExamQuestion): { text: string; image?: string; originalIdx: number }[] => {
        if (!question.options) return [];
        if (!shuffledOptionsRef.current[question.id]) {
            const indices = question.options.map((_, i) => i);
            // Fisher–Yates
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            shuffledOptionsRef.current[question.id] = indices;
        }
        return shuffledOptionsRef.current[question.id].map(i => ({
            text: question.options![i],
            image: question.optionImages?.[i],
            originalIdx: i,
        }));
    };

    const formatTime = (s: number) => {
        const displaySeconds = Math.max(0, s);
        const h = Math.floor(displaySeconds / 3600);
        const m = Math.floor((displaySeconds % 3600) / 60);
        const sec = displaySeconds % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
        return `${m}:${String(sec).padStart(2, "0")}`;
    };

    const answeredCount = questions.filter(q => answers[q.id]?.trim()).length;
    answeredCountRef.current = answeredCount;

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

    if (submitFailed) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="p-8 text-center space-y-6">
                        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 mb-2">Илгээхэд алдаа гарлаа</h2>
                            <p className="text-slate-500 text-sm">Серверт холбогдож чадсангүй. Дахин оролдоно уу эсвэл администратортай холбогдоно уу.</p>
                        </div>
                        <Button
                            onClick={() => {
                                setSubmitFailed(false);
                                submittedRef.current = false;
                                submitAttemptsRef.current = 0;
                                setSubmitting(true);
                                setIsOfflineRetrying(false);
                                submittedRef.current = true;
                                attemptSubmit(1);
                            }}
                            className="w-full bg-blue-600 text-white"
                        >
                            Дахин оролдох
                        </Button>
                        <Button onClick={() => router.push("/student")} variant="outline" className="w-full">
                            Буцах
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ─── Render: already submitted ────────────────────────────────────────────
    if (submitted) {
        const _examEndMs = (meta && examStartedAt) ? examStartedAt + meta.duration * 60_000 + (liveReg?.extendedTime ? liveReg.extendedTime * 1000 : 0) : 0;
        const _canRetake = getServerTimeValue() < _examEndMs;

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

                        {/* Зөрчлийн улмаас дүн эргэлзээтэй болсон тохиолдол */}
                        {submitResult?.invalidatedByViolation && (
                            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-left space-y-2">
                                <p className="font-black text-amber-900 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" /> Дүрэм зөрчсөн тэмдэглэгээтэй
                                </p>
                                <p className="text-sm text-amber-800">
                                    Таны хариултууд бүрэн хадгалагдсан. Гэвч цонх/таб {MAX_VIOLATIONS} удаа
                                    солигдсон тул дүн тань <strong>шалгагдах хүртэл түр эргэлзээтэй</strong> гэж
                                    тэмдэглэгдлээ. Эцсийн шийдвэрийг багш/админ гаргана.
                                </p>
                            </div>
                        )}

                        {/* FIX E2: Show the captured score breakdown when available */}
                        {submitResult && !submitResult.invalidatedByViolation && (
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 my-4 text-center">
                                <div className="text-5xl font-black text-blue-700">{submitResult.percentage.toFixed(1)}%</div>
                                <div className="text-slate-600 mt-2">Таны оноо: <strong>{submitResult.score}</strong></div>
                                <div className={`mt-3 inline-block px-4 py-1 rounded-full font-bold ${submitResult.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                    {submitResult.passed ? "✓ Тэнцлээ" : "✗ Тэнцээгүй"}
                                </div>
                            </div>
                        )}

                        <Button onClick={() => router.push("/student")} className="w-full bg-blue-600 text-white">
                            Хянах самбар руу буцах
                        </Button>

                        {_canRetake && user && (
                            <div className="pt-4 mt-6 border-t border-slate-100">
                                <p className="text-xs text-slate-400 mb-3">Техникийн эсвэл бусад асуудлаас болж шалгалт дутуу илгээгдсэн бол дахин өгөх хүсэлт илгээх боломжтой (Шалгалтын цаг дуусахаас өмнө).</p>
                                <Button
                                    variant="outline"
                                    disabled={retakeRequested}
                                    onClick={() => {
                                        setRetakeReason("");
                                        setShowRetakeDialog(true);
                                    }}
                                    className="w-full text-slate-600 hover:text-blue-600 border-slate-200"
                                >
                                    {retakeRequested ? "Хүсэлт илгээгдсэн" : "Дахин өгөх (Алдаа гарсан үед)"}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* FIX E1: Retake reason modal — student writes a custom reason */}
                {showRetakeDialog && user && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
                            <div className="bg-linear-to-r from-blue-600 to-indigo-600 px-6 py-5">
                                <h3 className="text-xl font-black text-white flex items-center gap-2">
                                    <RotateCcw className="w-5 h-5" /> Дахин шалгалтын хүсэлт
                                </h3>
                                <p className="text-blue-100 text-sm mt-1">
                                    Юу болсныг тодорхой бичвэл админ хурдан шийднэ
                                </p>
                            </div>
                            <div className="p-6">
                            <textarea
                                value={retakeReason}
                                onChange={e => setRetakeReason(e.target.value)}
                                placeholder="Жишээ: Интернэт тасарч, шалгалт дундуур хаагдсан..."
                                className="w-full p-3 rounded-xl border-2 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-50 min-h-[110px] resize-none"
                                maxLength={500}
                                autoFocus
                            />
                            <div className={`text-xs mt-1.5 font-bold ${retakeReason.trim().length < 10 ? "text-amber-600" : "text-emerald-600"}`}>
                                {retakeReason.trim().length < 10
                                    ? `Дор хаяж 10 тэмдэгт бичнэ үү (${retakeReason.trim().length}/10)`
                                    : `${retakeReason.length}/500 тэмдэгт`}
                            </div>
                            <div className="flex gap-2 mt-5">
                                <button onClick={() => setShowRetakeDialog(false)} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors">Болих</button>
                                <button
                                    onClick={async () => {
                                        if (retakeReason.trim().length < 10) {
                                            toast.error("Шалтгаан 10-аас доошгүй тэмдэгт байх ёстой");
                                            return;
                                        }
                                        try {
                                            await RetakeService.requestRetake({
                                                studentId: user.uid,
                                                examId,
                                                reason: retakeReason.trim(),
                                                studentName: profile ? `${profile.lastName} ${profile.firstName}` : user.email || user.uid,
                                                examTitle: meta?.title || "Шалгалт",
                                            });
                                            setShowRetakeDialog(false);
                                            setRetakeRequested(true);
                                            toast.success("Хүсэлт илгээгдлээ");
                                        } catch (e: unknown) {
                                            const msg = e instanceof Error ? e.message : "Харамсалтай нь хүсэлт илгээхэд алдаа гарлаа.";
                                            toast.error(msg);
                                        }
                                    }}
                                    className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors"
                                >
                                    Илгээх
                                </button>
                            </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    /** Админаас ирсэн сануулга — дэлгэц дүүрэн, хаах товчтой. */
    const nudgeOverlay = nudge ? (
        <div className="fixed inset-0 z-[70] bg-amber-500/95 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="text-center text-white max-w-lg space-y-6">
                <AlertTriangle className="w-20 h-20 mx-auto animate-bounce" />
                <h2 className="text-4xl font-black">Багшаас сануулга!</h2>
                <p className="text-xl font-medium text-amber-50">
                    Та шалгалтад бэлэн болоогүй байна. <strong>«Бэлэн боллоо»</strong> товчийг
                    даран багшийг хүлээнэ үү — эс бөгөөс шалгалт эхлэхэд орж чадахгүй.
                </p>
                <Button
                    onClick={() => setNudge(false)}
                    className="bg-white text-amber-700 hover:bg-amber-50 font-black h-12 px-8 rounded-xl text-lg"
                >
                    Ойлголоо
                </Button>
            </div>
        </div>
    ) : null;

    // ─── Render: хүлээх танхим ба танилцуулга (шалгалт эхлэхээс ӨМНӨ) ───────
    // Энэ үед `meta` (асуултын API) хараахан ирээгүй — шалгалтын мэдээллийг
    // `examInfo` (шууд сонсогч)-оос авна.
    if (!started || !meta) {
        const info = examInfo;
        if (!info) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                </div>
            );
        }

        // Шалгалт эхэлчихээд дууссан бол
        if (examStartedAt && getServerTimeValue() > examStartedAt + info.duration * 60_000) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                    <Card className="max-w-md w-full shadow-2xl">
                        <CardHeader className="bg-red-600 text-white rounded-t-xl p-8 text-center">
                            <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                            <CardTitle className="text-2xl font-black">Хугацаа дууссан</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 text-center space-y-6">
                            <p className="text-slate-600 font-medium">Энэхүү шалгалтын хугацаа дууссан байна.</p>
                            <Button onClick={() => router.push("/student")} className="w-full bg-slate-800 text-white h-12 rounded-xl">Буцах</Button>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        // ── Бэлэн болсон → ХҮЛЭЭХ ТАНХИМ ───────────────────────────────────
        if (isReady) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-600 via-indigo-600 to-purple-700 p-4">
                    {nudgeOverlay}
                    <div className="w-full max-w-lg text-center text-white space-y-8">
                        <div className="w-24 h-24 rounded-full bg-white/15 backdrop-blur flex items-center justify-center mx-auto ring-4 ring-white/25">
                            <CheckCircle className="w-12 h-12 text-emerald-300" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black">Бэлэн боллоо!</h1>
                            <p className="text-blue-100 text-lg mt-3">
                                Багш шалгалтыг эхлүүлэхийг хүлээж байна…
                            </p>
                        </div>

                        <div className="bg-white/12 backdrop-blur rounded-3xl p-6 space-y-3 text-left">
                            <div className="flex justify-between border-b border-white/20 pb-2">
                                <span className="text-blue-100">Шалгалт</span>
                                <span className="font-bold">{info.title}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/20 pb-2">
                                <span className="text-blue-100">Үргэлжлэх</span>
                                <span className="font-bold">{info.duration} минут</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-blue-100">Таны нэр</span>
                                <span className="font-bold">{profile ? `${profile.lastName} ${profile.firstName}` : ""}</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-center gap-3 text-blue-100">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="font-bold">Эхлэхэд шалгалт автоматаар нээгдэнэ — хуудсаа хаахгүй байна уу</span>
                        </div>

                        {!isFullscreen && (
                            <Button onClick={handleReenterFullscreen} className="bg-white text-indigo-700 hover:bg-blue-50 font-bold gap-2">
                                <Maximize className="w-4 h-4" /> Бүтэн дэлгэц рүү шилжих
                            </Button>
                        )}
                    </div>
                </div>
            );
        }

        // ── Бэлэн болоогүй → танилцуулга + дүрэм ───────────────────────────
        if (examStartedAt) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                    <Card className="max-w-md w-full shadow-2xl">
                        <CardHeader className="bg-amber-500 text-white rounded-t-xl p-8 text-center">
                            <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                            <CardTitle className="text-2xl font-black">Шалгалт эхэлчихсэн байна</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 text-center space-y-5">
                            <p className="text-slate-600 font-medium">
                                Та «Бэлэн боллоо» товчийг дарж амжаагүй тул шалгалт руу орох боломжгүй.
                                Багш/админд хандаж оруулах хүсэлт тавина уу.
                            </p>
                            <Button onClick={() => window.location.reload()} className="w-full bg-blue-600 text-white h-12 rounded-xl">
                                Дахин шалгах
                            </Button>
                            <Button onClick={() => router.push("/student")} variant="outline" className="w-full h-12 rounded-xl">Буцах</Button>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                {nudgeOverlay}
                <Card className="max-w-lg w-full shadow-2xl">
                    <CardHeader className="bg-linear-to-r from-blue-600 to-indigo-600 text-white rounded-t-xl p-8">
                        <CardTitle className="text-2xl font-black">{info.title}</CardTitle>
                        <p className="text-blue-100 mt-1">{info.grade}-р анги</p>
                    </CardHeader>
                    <CardContent className="p-8 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <Clock className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                                <div className="text-2xl font-black text-slate-800">{info.duration}</div>
                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Минут</div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                                <div className="text-2xl font-black text-slate-800">
                                    {info.scheduledAt ? new Date(info.scheduledAt).toLocaleTimeString("mn-MN",{hour:"2-digit",minute:"2-digit"}) : "—"}
                                </div>
                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Товлосон цаг</div>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                            <p className="font-bold text-amber-800 text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Анхааруулга
                            </p>
                            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                                <li><strong>«Бэлэн боллоо»</strong> дарсны дараа бүтэн дэлгэц болж, багш эхлүүлэхийг хүлээнэ</li>
                                <li>Багш эхлүүлэхэд <strong>бүх сурагчид зэрэг</strong> шалгалт эхэлнэ</li>
                                <li>Эхэлсний дараа бэлэн болоогүй хүн <strong>орох боломжгүй</strong></li>
                                <li>Шалгалт эхэлсэний дараа <strong>{MAX_VIOLATIONS} удаа</strong> өөр цонх/таб нээвэл автоматаар дуусаж илгээгдэнэ</li>
                                <li>Хуулах (Ctrl+C / Ctrl+V), хэвлэх (Ctrl+P), хөгжүүлэгчийн хэрэгсэл хориглоно</li>
                                <li>Хугацаа дуусахад хариулт автоматаар илгээгдэнэ</li>
                                <li>Хариултууд <strong>60 секунд</strong> тутамд автоматаар хадгалагдана</li>
                                <li>Шалгалтын цаг сервер дээрээс тоологдоно</li>
                            </ul>
                            <label className="flex items-start gap-2 mt-3 cursor-pointer">
                                <input type="checkbox" checked={acknowledgedRules} onChange={e => setAcknowledgedRules(e.target.checked)} className="mt-1" />
                                <span className="text-sm text-amber-800 font-medium">Дээрх дүрмийг уншиж танилцсан, хүлээн зөвшөөрч байна</span>
                            </label>
                        </div>

                        <Button
                            onClick={handleReady}
                            disabled={!acknowledgedRules || readySubmitting}
                            className={`w-full h-14 bg-linear-to-r from-emerald-600 to-green-600 text-white font-black text-lg rounded-2xl shadow-xl ${(!acknowledgedRules || readySubmitting) ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            {readySubmitting ? "Бүртгэж байна..." : "Бэлэн боллоо"}
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
            {nudgeOverlay}
            {/* Бүтэн дэлгэцээс гарсан үеийн анхааруулах самбар.
                ⚠️ Энэ нь дүрэм зөрчилд ТООЦОГДОХГҮЙ — зөвхөн анхааруулга.
                Fullscreen-ийг дахин асаахад хэрэглэгчийн товшилт заавал хэрэгтэй тул
                автоматаар биш, товчоор буцаана. */}
            {showFullscreenPrompt && (
                <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[60] bg-indigo-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <Card className="max-w-md w-full border-0 rounded-3xl overflow-hidden shadow-2xl">
                        <CardHeader className="bg-linear-to-r from-amber-500 to-orange-600 text-white p-7 text-center">
                            <Maximize className="w-12 h-12 mx-auto mb-3" />
                            <CardTitle className="text-2xl font-black">Бүтэн дэлгэцээс гарлаа</CardTitle>
                        </CardHeader>
                        <CardContent className="p-7 text-center space-y-5">
                            <p className="text-slate-700 font-medium">
                                Шалгалтыг <strong className="text-orange-600">бүтэн дэлгэц</strong> дээр өгөх ёстой.
                                Хугацаа үргэлжилсээр байгаа тул доорх товчийг дарж шууд буцна уу.
                            </p>
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-sm text-emerald-800 font-semibold">
                                ✓ Таны хариултууд хадгалагдсан хэвээр байна — энэ нь дүрэм зөрчилд тооцогдохгүй.
                            </div>
                            <Button
                                onClick={handleReenterFullscreen}
                                className="w-full h-14 bg-linear-to-r from-blue-600 to-indigo-600 text-white font-black text-lg rounded-2xl shadow-xl gap-2"
                            >
                                <Maximize className="w-5 h-5" />
                                Бүтэн дэлгэц рүү буцах
                            </Button>
                            <button
                                onClick={() => setShowFullscreenPrompt(false)}
                                className="text-xs font-bold text-slate-500 hover:text-indigo-600 underline"
                            >
                                Одоохондоо үргэлжлүүлэх
                            </button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Violation warning banner */}
            {showViolationWarning && (
                <div role="alert" className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white text-center py-3 font-bold animate-bounce">
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

                    <div
                        role="timer"
                        aria-live="polite"
                        aria-label="Шалгалтын үлдсэн хугацаа"
                        className={`font-mono font-black text-xl px-4 py-2 rounded-xl border-2 ${timeLeft < 300 ? "bg-red-50 border-red-300 text-red-600 animate-pulse" : "bg-blue-50 border-blue-200 text-blue-700"}`}
                    >
                        <Clock className="w-4 h-4 inline mr-1 -mt-0.5" />
                        {formatTime(timeLeft)}
                    </div>

                    {/* Бүтэн дэлгэц рүү шилжих товч — зөвхөн бүтэн дэлгэц идэвхгүй үед */}
                    {!isFullscreen && (
                        <Button
                            onClick={handleReenterFullscreen}
                            title="Бүтэн дэлгэц рүү шилжих"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 shrink-0"
                        >
                            <Maximize className="w-4 h-4" />
                            <span className="hidden sm:inline">Бүтэн дэлгэц</span>
                        </Button>
                    )}

                    <Button
                        onClick={confirmAndSubmit}
                        disabled={submitting || isOfflineRetrying}
                        className={`${isOfflineRetrying ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"} text-white font-bold gap-2 shrink-0`}
                    >
                        <Send className="w-4 h-4" />
                        {isOfflineRetrying ? "Сүлжээ хүлээж байна..." : submitting ? "Илгээж байна..." : "Илгээх"}
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
                                        aria-current={i === currentIdx ? "page" : undefined}
                                        aria-label={`Асуулт ${i + 1}${answers[q.id]?.trim() ? ', хариулсан' : ''}`}
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
                                                <img src={currentQ.mediaUrl} loading="lazy" alt="Асуултын зураг" className="max-w-full h-auto max-h-96 object-contain mx-auto" />
                                            )}
                                            {currentQ.mediaType === "audio" && (
                                                <audio controls src={currentQ.mediaUrl} className="w-full p-4" />
                                            )}
                                            {currentQ.mediaType === "video" && (
                                                <video controls src={currentQ.mediaUrl} className="w-full max-h-96" />
                                            )}
                                        </div>
                                    )}

                                    {/* Нэмэлт зургууд (extraImageUrls) */}
                                    {currentQ.extraImageUrls && currentQ.extraImageUrls.length > 0 && (
                                        <div className="space-y-2">
                                            {currentQ.extraImageUrls.map((url, i) => (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <div key={i} className="rounded-2xl overflow-hidden border border-slate-100">
                                                    <img src={url} loading="lazy" alt={`Нэмэлт зураг ${i + 2}`} className="max-w-full h-auto max-h-96 object-contain mx-auto" />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Multiple choice options */}
                                    {currentQ.type === "multiple_choice" && currentQ.options && (
                                        <div className="space-y-3">
                                            {getShuffledOptions(currentQ).map((shuffled, idx) => {
                                                const letter = String.fromCharCode(65 + idx); // A, B, C, D
                                                // A2: store the option TEXT as the answer so grading still matches.
                                                const isSelected = answers[currentQ.id] === shuffled.text;
                                                return (
                                                    <label
                                                        key={shuffled.originalIdx}
                                                        aria-label={`Сонголт ${letter}: ${shuffled.text}`}
                                                        className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                                                            isSelected
                                                                ? "border-blue-500 bg-blue-50 shadow-md"
                                                                : "border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30"
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={currentQ.id}
                                                            value={shuffled.text}
                                                            checked={isSelected}
                                                            onChange={() => setAnswers(prev => ({ ...prev, [currentQ.id]: shuffled.text }))}
                                                            className="sr-only"
                                                        />
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 transition-all ${
                                                            isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                                                        }`}>
                                                            {letter}
                                                        </div>
                                                        <div className="flex-1 pt-1 font-medium text-slate-700">
                                                            <MathRenderer content={shuffled.text} />
                                                            {shuffled.image && (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img src={shuffled.image} loading="lazy" alt={`Option ${letter}`} className="mt-2 max-h-24 object-contain" />
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
                                            {isNumericAnswer(currentQ) ? (
                                                /* Тоон хариулт — зөвхөн тоо оруулна. Гар утас/таблет дээр
                                                   тоон гар автоматаар нээгдэнэ (inputMode="decimal"). */
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        autoComplete="off"
                                                        className="w-full border-2 border-blue-200 bg-blue-50/40 rounded-2xl p-4 text-slate-900 font-black text-2xl tracking-wide text-center focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                                        placeholder={currentQ.answerFormat === "fraction" ? "жишээ: 5/6" : "жишээ: 12.5"}
                                                        value={answers[currentQ.id] || ""}
                                                        onChange={e => {
                                                            // Зөвхөн цифр, тэмдэг, аравтын таслал, бутархайн зураас
                                                            const onlyNumeric = e.target.value.replace(/[^\d.,/-]/g, "");
                                                            setAnswers(prev => ({ ...prev, [currentQ.id]: onlyNumeric }));
                                                        }}
                                                    />
                                                    <p className="text-xs font-bold text-blue-700 text-center">
                                                        {currentQ.answerFormat === "fraction"
                                                            ? "Зөвхөн тоо бичнэ — бутархайг 5/6 хэлбэрээр (аравтаар бичсэн ч болно)"
                                                            : "Зөвхөн тоо бичнэ — нэгж (см, км) бичих шаардлагагүй"}
                                                    </p>
                                                </div>
                                            ) : (
                                                <textarea
                                                    className="w-full border-2 border-slate-200 rounded-2xl p-4 text-slate-800 font-medium focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-50 transition-all resize-none text-lg"
                                                    rows={currentQ.type === "fill_in_blank" ? 2 : 4}
                                                    placeholder={currentQ.type === "fill_in_blank" ? "Хоосон зайд нөхөх үгээ энд бичнэ үү..." : "Хариултаа энд бичнэ үү..."}
                                                    value={answers[currentQ.id] || ""}
                                                    onChange={e => setAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* FIX E3 / FIX 16: Per-question report button — opens a proper modal instead of window.prompt */}
                                    {user && (
                                        <button
                                            onClick={() => {
                                                setReportingQuestionId(currentQ.id);
                                                setReportReason("");
                                            }}
                                            className="text-xs text-slate-500 hover:text-red-600 mt-2 underline"
                                        >
                                            ⚑ Энэ асуултанд асуудал илгээх
                                        </button>
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
                                                onClick={confirmAndSubmit}
                                                className={`gap-2 text-white ${isOfflineRetrying ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                                                disabled={submitting || isOfflineRetrying}
                                            >
                                                <Send className="w-4 h-4" />
                                                {isOfflineRetrying ? "Сүлжээ хүлээж байна..." : submitting ? "Илгээж байна..." : "Шалгалт илгээх"}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Live Chat Support */}
            {user && profile && (
                <ExamSupportChat
                    examId={examId}
                    studentId={user.uid}
                    studentName={`${profile.lastName || ""} ${profile.firstName || ""}`.trim()}
                />
            )}

            {/* FIX 16: Question report modal — replaces window.prompt */}
            {reportingQuestionId && user && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                        <h3 className="text-lg font-black mb-3 text-slate-900">Асуултын талаар санал илгээх</h3>
                        <textarea
                            value={reportReason}
                            onChange={e => setReportReason(e.target.value.slice(0, 300))}
                            placeholder="Юу буруу/тодорхойгүй байгааг бичнэ үү (10-300 тэмдэгт)..."
                            className="w-full p-3 rounded-xl border-2 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none min-h-[100px] resize-none"
                            maxLength={300}
                        />
                        <div className="text-xs text-slate-500 mt-1">{reportReason.length}/300</div>
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => setReportingQuestionId(null)}
                                disabled={reportSubmitting}
                                className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
                            >
                                Болих
                            </button>
                            <button
                                disabled={reportSubmitting}
                                onClick={async () => {
                                    if (reportReason.trim().length < 10) {
                                        toast.error("10-аас доошгүй тэмдэгт");
                                        return;
                                    }
                                    setReportSubmitting(true);
                                    try {
                                        await addDoc(collection(db, "question_reports"), {
                                            questionId: reportingQuestionId,
                                            examId,
                                            studentId: user.uid,
                                            reason: reportReason.trim().slice(0, 300),
                                            createdAt: serverTimestamp(),
                                        });
                                        toast.success("Илгээгдлээ");
                                        setReportingQuestionId(null);
                                    } catch (err) {
                                        toast.error(err instanceof Error ? err.message : "Алдаа");
                                    } finally {
                                        setReportSubmitting(false);
                                    }
                                }}
                                className="flex-1 p-2 bg-blue-600 text-white rounded"
                            >
                                {reportSubmitting ? "Илгээж байна..." : "Илгээх"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
