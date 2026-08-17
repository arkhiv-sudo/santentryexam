"use client";

import { useEffect, useState } from "react";
import { collection, query, where, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam, ExamQuestion, GradedAnswer } from "@/types";
import MathRenderer from "@/components/exam/MathRenderer";
import { Button } from "@/components/ui/Button";
import { downloadCsv, formatDuration, safeFileName } from "@/lib/download";
import { X, CheckCircle2, XCircle, Loader2, Download, MinusCircle } from "lucide-react";

interface SubmissionDoc {
    id: string;
    score?: number;
    maxScore?: number;
    percentage?: number;
    passed?: boolean;
    timeTaken?: number;
    gradedAnswers?: Record<string, GradedAnswer>;
    forceSubmittedByAdmin?: string | null;
}

/**
 * Нэг сурагчийн шалгалтын хариултыг асуулт бүрээр нь харуулах цонх.
 *
 * Асуултын агуулгыг шалгалтын `questionSnapshot`-оос авна (шалгалт зарлагдах
 * үед хөлдөөсөн хувилбар) — тиймээс асуулт хожим засагдсан ч сурагчийн харсан
 * яг тэр асуулт харагдана.
 */
export default function SubmissionDetailModal({
    examId,
    studentId,
    studentName,
    exam: examProp,
    onClose,
}: {
    examId: string;
    studentId: string;
    studentName: string;
    exam?: Exam;
    onClose: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [submission, setSubmission] = useState<SubmissionDoc | null>(null);
    const [exam, setExam] = useState<Exam | undefined>(examProp);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError("");
            try {
                const snap = await getDocs(query(
                    collection(db, "submissions"),
                    where("examId", "==", examId),
                    where("studentId", "==", studentId),
                    limit(1),
                ));

                if (!cancelled) {
                    if (snap.empty) {
                        setSubmission(null);
                    } else {
                        const d = snap.docs[0];
                        setSubmission({ id: d.id, ...d.data() } as SubmissionDoc);
                    }
                }

                if (!examProp) {
                    const examSnap = await getDoc(doc(db, "exams", examId));
                    if (!cancelled && examSnap.exists()) {
                        setExam({ id: examSnap.id, ...examSnap.data() } as unknown as Exam);
                    }
                }
            } catch (err) {
                console.error("[SubmissionDetailModal]", err);
                if (!cancelled) setError(err instanceof Error ? err.message : "Ачаалахад алдаа гарлаа");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [examId, studentId, examProp]);

    // Esc товчоор хаах
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const graded = submission?.gradedAnswers || {};
    const snapshot: ExamQuestion[] = exam?.questionSnapshot || [];
    // Асуултын дараалал: snapshot-ын дарааллаар, snapshot байхгүй бол хариултын дарааллаар
    const questionIds = snapshot.length > 0
        ? snapshot.map(q => q.id)
        : Object.keys(graded);

    const answeredCount = questionIds.filter(id => (graded[id]?.studentAnswer || "").trim() !== "").length;
    const correctCount = questionIds.filter(id => graded[id]?.isCorrect).length;

    const exportCsv = () => {
        downloadCsv(
            ["№", "Асуулт", "Сурагчийн хариулт", "Зөв хариулт", "Зөв эсэх", "Авсан оноо", "Нийт оноо"],
            questionIds.map((qId, i) => {
                const g = graded[qId];
                const q = snapshot.find(s => s.id === qId);
                return [
                    i + 1,
                    (q?.content || "").replace(/\s+/g, " ").slice(0, 300),
                    g?.studentAnswer || "",
                    g?.correctAnswer || "",
                    g?.isCorrect ? "Зөв" : "Буруу",
                    g?.earnedPoints ?? 0,
                    g?.points ?? q?.points ?? 1,
                ];
            }),
            `${safeFileName(studentName)}_hariult.csv`,
        );
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-4xl my-8 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Толгой */}
                <div className="sticky top-0 bg-white border-b border-slate-200 rounded-t-2xl px-6 py-4 flex items-start justify-between gap-4 z-10">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">{studentName}</h3>
                        <p className="text-sm text-slate-500">{exam?.title || "Шалгалт"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {submission && (
                            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
                                <Download className="w-3.5 h-3.5" /> CSV
                            </Button>
                        )}
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-5">
                    {loading && (
                        <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                            Ачаалж байна...
                        </div>
                    )}

                    {!loading && error && (
                        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">{error}</div>
                    )}

                    {!loading && !error && !submission && (
                        <div className="py-12 text-center text-slate-500">
                            Энэ сурагч шалгалтаа хараахан илгээгээгүй байна.
                        </div>
                    )}

                    {!loading && submission && (
                        <>
                            {/* Товчлол */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-blue-700">Оноо</p>
                                    <p className="text-xl font-black text-blue-900">
                                        {submission.score ?? 0}<span className="text-blue-400">/{submission.maxScore ?? 0}</span>
                                    </p>
                                </div>
                                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-amber-700">Хувь</p>
                                    <p className="text-xl font-black text-amber-900">{submission.percentage ?? 0}%</p>
                                </div>
                                <div className={`rounded-xl p-3 text-center border ${submission.passed ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                                    <p className={`text-[10px] font-bold uppercase ${submission.passed ? "text-emerald-700" : "text-red-700"}`}>Дүгнэлт</p>
                                    <p className={`text-xl font-black ${submission.passed ? "text-emerald-900" : "text-red-900"}`}>
                                        {submission.passed ? "Тэнцсэн" : "Тэнцээгүй"}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-slate-600">Зарцуулсан</p>
                                    <p className="text-xl font-black text-slate-800">{formatDuration(submission.timeTaken)}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs font-bold">
                                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                                    Хариулсан: {answeredCount}/{questionIds.length}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                    Зөв: {correctCount}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                                    Буруу: {questionIds.length - correctCount}
                                </span>
                                {submission.forceSubmittedByAdmin && (
                                    <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
                                        Админ албадан илгээсэн
                                    </span>
                                )}
                            </div>

                            {/* Асуулт бүрчилсэн задаргаа */}
                            <div className="space-y-3">
                                {questionIds.map((qId, i) => {
                                    const g = graded[qId];
                                    const q = snapshot.find(s => s.id === qId);
                                    const empty = !g || (g.studentAnswer || "").trim() === "";
                                    return (
                                        <div
                                            key={qId}
                                            className={`rounded-xl border p-4 ${
                                                g?.isCorrect
                                                    ? "border-emerald-200 bg-emerald-50/40"
                                                    : empty
                                                        ? "border-slate-200 bg-slate-50"
                                                        : "border-red-200 bg-red-50/40"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <span className="text-xs font-black text-slate-400 shrink-0">
                                                    Асуулт {i + 1}
                                                </span>
                                                <span className="flex items-center gap-1.5 text-xs font-bold shrink-0">
                                                    {g?.isCorrect ? (
                                                        <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> <span className="text-emerald-700">+{g.earnedPoints}</span></>
                                                    ) : empty ? (
                                                        <><MinusCircle className="w-4 h-4 text-slate-400" /> <span className="text-slate-500">Хариулаагүй</span></>
                                                    ) : (
                                                        <><XCircle className="w-4 h-4 text-red-500" /> <span className="text-red-600">0 / {g?.points ?? 1}</span></>
                                                    )}
                                                </span>
                                            </div>

                                            {q?.content && (
                                                <div className="text-sm text-slate-800 font-medium mb-3">
                                                    <MathRenderer content={q.content} />
                                                </div>
                                            )}

                                            <div className="grid sm:grid-cols-2 gap-2 text-sm">
                                                <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                                                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Сурагчийн хариулт</p>
                                                    <div className={empty ? "text-slate-400 italic" : "text-slate-800 font-medium"}>
                                                        {empty ? "хоосон" : <MathRenderer content={g.studentAnswer} />}
                                                    </div>
                                                </div>
                                                <div className="rounded-lg bg-white border border-emerald-200 p-2.5">
                                                    <p className="text-[10px] font-bold uppercase text-emerald-600 mb-1">Зөв хариулт</p>
                                                    <div className="text-slate-800 font-medium">
                                                        {g?.correctAnswer ? <MathRenderer content={g.correctAnswer} /> : "—"}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
