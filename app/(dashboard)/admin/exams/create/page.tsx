"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExamService } from "@/lib/services/exam-service";
import { QuestionService } from "@/lib/services/question-service";
import { SettingsService } from "@/lib/services/settings-service";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "sonner";
import { ArrowLeft, Save, Calendar, Clock, GraduationCap, ListOrdered, ChevronRight, ChevronLeft, BookOpen, Loader2 } from "lucide-react";
import Link from "next/link";
import { Exam, Subject } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

const GRADES_MAP: Record<string, string> = {
    "1": "1-р анги", "2": "2-р анги", "3": "3-р анги", "4": "4-р анги",
    "5": "5-р анги", "6": "6-р анги", "7": "7-р анги", "8": "8-р анги",
    "9": "9-р анги", "10": "10-р анги", "11": "11-р анги", "12": "12-р анги"
};
const GRADES_LIST = Object.entries(GRADES_MAP).map(([id, name]) => ({ id, name }));

export default function CreateExamPage() {
    const router = useRouter();
    const { user, profile, loading: authLoading } = useAuth();
    const [saving, setSaving] = useState(false);
    const [step, setStep] = useState(1);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    // FIX 11: Show a spinner while waiting for the question assignment Cloud Function
    // to mark questionsAssigned=true on the exam document after publish.
    const [waitingForQuestions, setWaitingForQuestions] = useState(false);
    const [loadingSubjects, setLoadingSubjects] = useState(false);

    const { data: lessonsData = [] } = useQuery({
        queryKey: ["lessons"],
        queryFn: () => SettingsService.getLessons(),
        staleTime: 30 * 60 * 1000,
    });
    const lessonsMap = Object.fromEntries(lessonsData.map((l: { id: string; name: string }) => [l.id, l.name]));

    const [formData, setFormData] = useState({
        title: "",
        scheduledAt: "",
        registrationEndDate: "",
        duration: "60",
        grade: "",
        maxQuestions: "30",
        passingScore: "60",
        maxAttempts: "", // FIX F1: empty = unlimited
        status: "draft" as Exam["status"],
        // FIX 43: practice mode flag — 'practice' means submissions/results are NOT persisted.
        examMode: "live" as NonNullable<Exam["examMode"]>,
    });

    const [distribution, setDistribution] = useState<Record<string, number>>({});
    const [availableCounts, setAvailableCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    const handleNextStep = async () => {
        if (!formData.title || !formData.scheduledAt || !formData.registrationEndDate || !formData.grade) {
            toast.error("Бүх талбарыг бөглөнө үү");
            return;
        }

        const scheduledDate = new Date(formData.scheduledAt);
        const regEndDate = new Date(formData.registrationEndDate);

        if (regEndDate >= scheduledDate) {
            toast.error("Бүртгэл дуусах огноо шалгалт эхлэх огнооноос өмнө байх ёстой");
            return;
        }

        setLoadingSubjects(true);
        try {
            const data = await SettingsService.getSubjects(formData.grade);
            setSubjects(data);

            // Fetch question counts for these subjects
            const subjectIds = data.map(s => s.id);
            const counts = await QuestionService.getQuestionCounts(formData.grade, subjectIds);
            setAvailableCounts(counts);

            // FIX 21: Reset distribution to only include subjects for this grade so
            // IDs from a previously selected grade don't leak into the new distribution.
            const freshDist: Record<string, number> = {};
            data.forEach((s: Subject) => {
                freshDist[s.id] = distribution[s.id] ?? 0;
            });
            setDistribution(freshDist);

            setStep(2);
        } catch (error) {
            console.error("Failed to load step 2 data:", error);
            toast.error("Мэдээллийг ачаалахад алдаа гарлаа");
        } finally {
            setLoadingSubjects(false);
        }
    };

    const totalAssigned = Object.values(distribution).reduce((sum, val) => sum + val, 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user) {
            toast.error("Та нэвтэрсэн байх шаардлагатай");
            return;
        }

        if (totalAssigned > parseInt(formData.maxQuestions)) {
            toast.error(`Нийт асуултын тоо ${formData.maxQuestions}-оос хэтэрч болохгүй`);
            return;
        }

        const hasOverRequested = subjects.some(s => {
            const count = distribution[s.id] || 0;
            const available = availableCounts[s.id] || 0;
            return count > available;
        });

        if (hasOverRequested) {
            toast.error("Санд байгаа асуултын тооноос их асуулт сонгох боломжгүй!");
            return;
        }

        if (totalAssigned === 0) {
            toast.error("Дор хаяж нэг сэдвээс асуулт сонгох шаардлагатай");
            return;
        }

        // FIX F2: For published exams, warn the admin if a subject pool is at or below
        // the requested count so they understand fewer questions may be drawn.
        if (formData.status === "published") {
            const insufficient: string[] = [];
            subjects.forEach(s => {
                const requested = distribution[s.id] || 0;
                if (requested <= 0) return;
                const available = availableCounts[s.id] || 0;
                if (available < requested) {
                    insufficient.push(`${s.name}: ${requested} хүссэн, ${available} байгаа`);
                }
            });
            if (insufficient.length > 0) {
                const proceed = window.confirm(
                    `Дараах сэдвүүдэд асуулт хүрэлцэхгүй байна:\n\n${insufficient.join("\n")}\n\nҮргэлжлүүлэх үү?`
                );
                if (!proceed) return;
            }
        }

        setSaving(true);
        try {
            const subjectDistribution = Object.entries(distribution)
                .filter(([, count]) => count > 0)
                .map(([subjectId, count]) => ({ subjectId, count }));

            const newExamId = await ExamService.createExam({
                title: formData.title,
                scheduledAt: new Date(formData.scheduledAt),
                registrationEndDate: new Date(formData.registrationEndDate),
                duration: parseInt(formData.duration),
                grade: formData.grade,
                maxQuestions: parseInt(formData.maxQuestions),
                passingScore: parseInt(formData.passingScore) || 0,
                ...(formData.maxAttempts ? { maxAttempts: parseInt(formData.maxAttempts) } : {}),
                examMode: formData.examMode,
                status: formData.status,
                createdBy: user.uid,
                questionIds: [],
                subjectDistribution
            });

            // FIX 11: If the exam was published, wait for the Cloud Function to assign
            // questions (questionsAssigned=true on the exam doc) before redirecting.
            // Show a spinner, and fall back to a redirect after 30 seconds.
            if (formData.status === 'published') {
                setSaving(false);
                setWaitingForQuestions(true);
                toast.success("Шалгалт үүсгэгдлээ. Асуулт оноож байна...");

                const unsub = onSnapshot(doc(db, "exams", newExamId), (snap) => {
                    if (snap.data()?.questionsAssigned) {
                        unsub();
                        setWaitingForQuestions(false);
                        toast.success("Асуулт амжилттай оноогдлоо!");
                        router.push('/admin/exams');
                    }
                });

                // Timeout fallback: redirect after 30 seconds regardless
                setTimeout(() => {
                    unsub();
                    setWaitingForQuestions(false);
                    toast.warning("Асуулт автоматаар оноогдсонгүй. Засах хуудаснаас шалгана уу.");
                    router.push('/admin/exams');
                }, 30000);
                return; // skip finally setSaving(false) — already handled above
            }

            toast.success("Шалгалт амжилттай үүсгэгдээ");
            router.push("/admin/exams");
        } catch (error) {
            console.error("Failed to create exam", error);
            toast.error("Шалгалт үүсгэхэд алдаа гарлаа");
        } finally {
            setSaving(false);
        }
    };

    if (authLoading) return <div className="p-8 text-center text-slate-500">Уншиж байна...</div>;

    // FIX 11: Show full-page spinner while waiting for question assignment
    if (waitingForQuestions) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                <div className="text-center">
                    <h2 className="text-xl font-bold text-slate-800">Асуулт оноож байна...</h2>
                    <p className="text-slate-500 mt-1 text-sm">Дуусахад автоматаар шилжинэ. Хүлээнэ үү (30 секунд).</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/exams">
                    <Button variant="ghost" size="sm" className="gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        Буцах
                    </Button>
                </Link>
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Шинэ шалгалт үүсгэх</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`h-1.5 w-12 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-slate-200'}`} />
                        <div className={`h-1.5 w-12 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-slate-200'}`} />
                        <span className="text-[10px] font-bold text-slate-400 uppercase ml-2 tracking-widest">
                            Алхам {step} / 2
                        </span>
                    </div>
                </div>
            </div>

            {step === 1 ? (
                <div className="space-y-6">
                    <Card className="border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50 border-b border-slate-200 py-4">
                            <CardTitle className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                <ListOrdered className="w-4 h-4" />
                                Алхам 1: Үндсэн мэдээлэл
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Шалгалтын нэр</label>
                                <Input
                                    placeholder="Жишээ: 2024 оны математикийн олимпиад"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-blue-500" />
                                        Шалгалт эхлэх огноо
                                    </label>
                                    <Input
                                        type="datetime-local"
                                        value={formData.scheduledAt}
                                        onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-emerald-500" />
                                        Бүртгэл дуусах огноо
                                    </label>
                                    <Input
                                        type="datetime-local"
                                        value={formData.registrationEndDate}
                                        onChange={(e) => setFormData({ ...formData, registrationEndDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Хугацаа (минут)</label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={formData.duration}
                                        onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <GraduationCap className="w-4 h-4 text-purple-500" />
                                        Анги
                                    </label>
                                    <Select
                                        value={formData.grade}
                                        onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                    >
                                        <option value="">Сонгох...</option>
                                        {GRADES_LIST.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Нийт асуулт</label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={formData.maxQuestions}
                                        onChange={(e) => setFormData({ ...formData, maxQuestions: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Суурь оноо — тэнцэх босго (%)</label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={formData.passingScore}
                                        onChange={(e) => setFormData({ ...formData, passingScore: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Төлөв</label>
                                    <Select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value as Exam["status"] })}
                                    >
                                        <option value="draft">Ноорог (Draft)</option>
                                        <option value="published">Нийтлэх (Published)</option>
                                        <option value="archived">Архивлах (Archived)</option>
                                    </Select>
                                </div>
                            </div>

                            {/* FIX F1: Optional limit on retake attempts */}
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Дээд тоо (хязгааргүй бол хоосон үлдээ)</label>
                                    <Input
                                        type="number"
                                        min="1"
                                        placeholder="Жнь: 2"
                                        value={formData.maxAttempts}
                                        onChange={(e) => setFormData({ ...formData, maxAttempts: e.target.value })}
                                    />
                                    <p className="text-xs text-slate-500">Анхны өгөлт + зөвшөөрөгдсөн дахин өгөлтийн нийт тоо.</p>
                                </div>
                            </div>

                            {/* FIX 43: Practice mode — graded answers are shown to the student but no submission/result is stored. */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.examMode === 'practice'}
                                        onChange={(e) => setFormData({ ...formData, examMode: e.target.checked ? 'practice' : 'live' })}
                                        className="w-4 h-4 rounded border-slate-300"
                                    />
                                    Дасгал төрөл (Дүн хадгалахгүй)
                                </label>
                                <p className="text-xs text-slate-500">Сурагч дүнгээ харна, гэхдээ submission/result бүртгэгдэхгүй.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Link href="/admin/exams">
                            <Button variant="outline" type="button">Цуцлах</Button>
                        </Link>
                        <Button
                            onClick={handleNextStep}
                            disabled={loadingSubjects}
                            className="bg-blue-600 text-white hover:bg-blue-700 gap-2"
                        >
                            {loadingSubjects ? "Уншиж байна..." : (
                                <>
                                    Үргэлжлүүлэх
                                    <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <Card className="border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50 border-b border-slate-200 py-4 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                <BookOpen className="w-4 h-4" />
                                Алхам 2: Хичээл / Сэдвүүдийн хуваарилалт
                            </CardTitle>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold border ${totalAssigned > parseInt(formData.maxQuestions) ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                Сонгосон: {totalAssigned} / {formData.maxQuestions}
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-100">
                                {subjects.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 italic">Сэдэв олдсонгүй. Энэ ангид сэдэв бүртгэгдээгүй байна.</div>
                                ) : (
                                    subjects.map((s) => {
                                        const count = distribution[s.id] || 0;
                                        const available = availableCounts[s.id] || 0;
                                        const deficit = count > available ? count - available : 0;

                                        return (
                                            <div key={s.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                                <div className="flex flex-col">
                                                    <div className="font-medium text-slate-700">{s.name}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {(s as Subject & { lessonId?: string }).lessonId && (
                                                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold border border-indigo-100">
                                                                {lessonsMap[(s as Subject & { lessonId?: string }).lessonId!] || "?"}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                                            Санд байгаа: {available}
                                                        </span>
                                                        {deficit > 0 ? (
                                                            <span className="text-[10px] bg-red-50 text-red-900 px-1.5 py-0.5 rounded font-bold border border-red-100">
                                                                {deficit} асуулт дутуу
                                                            </span>
                                                        ) : count > 0 && (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-100">
                                                                Бүрэн
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="w-24">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        max={available}
                                                        value={count}
                                                        onChange={(e) => setDistribution({
                                                            ...distribution,
                                                            [s.id]: parseInt(e.target.value) || 0
                                                        })}
                                                        className={`h-8 text-center font-bold ${deficit > 0 ? 'border-red-300 text-red-600 focus:ring-red-500' : ''}`}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-between gap-3">
                        <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>
                            <ChevronLeft className="w-4 h-4 mr-2" />
                            Буцах
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={saving || totalAssigned > parseInt(formData.maxQuestions)}
                            className="bg-blue-600 text-white hover:bg-blue-700 gap-2"
                        >
                            {saving ? "Хадгалж байна..." : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Шалгалт үүсгэх
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
