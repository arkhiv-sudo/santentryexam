"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExamService } from "@/lib/services/exam-service";
import { SettingsService } from "@/lib/services/settings-service";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "sonner";
import { ArrowLeft, Save, Calendar, Clock, GraduationCap, ListOrdered, ChevronRight, ChevronLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import { Exam, Subject } from "@/types";

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
    const [loadingSubjects, setLoadingSubjects] = useState(false);

    const [formData, setFormData] = useState({
        title: "",
        scheduledAt: "",
        registrationEndDate: "",
        duration: "60",
        grade: "",
        maxQuestions: "30",
        status: "draft" as Exam["status"]
    });

    const [distribution, setDistribution] = useState<Record<string, number>>({});

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

        if (regEndDate > scheduledDate) {
            toast.error("Бүртгэл дуусах огноо шалгалт эхлэх огнооноос хойш байж болохгүй");
            return;
        }

        setLoadingSubjects(true);
        try {
            const data = await SettingsService.getSubjects(formData.grade);
            setSubjects(data);

            // Initialize distribution with 0s if not already set
            const newDist: Record<string, number> = { ...distribution };
            data.forEach(s => {
                if (newDist[s.id] === undefined) newDist[s.id] = 0;
            });
            setDistribution(newDist);

            setStep(2);
        } catch (error) {
            toast.error("Сэдвүүдийг ачаалахад алдаа гарлаа");
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

        if (totalAssigned === 0) {
            toast.error("Дор хаяж нэг сэдвээс асуулт сонгох шаардлагатай");
            return;
        }

        setSaving(true);
        try {
            const subjectDistribution = Object.entries(distribution)
                .filter(([_, count]) => count > 0)
                .map(([subjectId, count]) => ({ subjectId, count }));

            await ExamService.createExam({
                title: formData.title,
                scheduledAt: new Date(formData.scheduledAt),
                registrationEndDate: new Date(formData.registrationEndDate),
                duration: parseInt(formData.duration),
                grade: formData.grade,
                maxQuestions: parseInt(formData.maxQuestions),
                status: formData.status,
                createdBy: user.uid,
                questionIds: [],
                subjectDistribution
            });
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
                                    <label className="text-sm font-semibold text-slate-700">Үргэлжлэх хугацаа (минут)</label>
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
                                    <label className="text-sm font-semibold text-slate-700">Нийт асуултын тоо</label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={formData.maxQuestions}
                                        onChange={(e) => setFormData({ ...formData, maxQuestions: e.target.value })}
                                    />
                                </div>
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
                                Алхам 2: Сэдвүүдийн хуваарилалт
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
                                    subjects.map((s) => (
                                        <div key={s.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                            <div className="font-medium text-slate-700">{s.name}</div>
                                            <div className="w-24">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={distribution[s.id] || 0}
                                                    onChange={(e) => setDistribution({
                                                        ...distribution,
                                                        [s.id]: parseInt(e.target.value) || 0
                                                    })}
                                                    className="h-8 text-center"
                                                />
                                            </div>
                                        </div>
                                    ))
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
