'use client';

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ExamService } from "@/lib/services/exam-service";
import { SettingsService } from "@/lib/services/settings-service";
import { QuestionService } from "@/lib/services/question-service";
// import { Exam, Subject } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChevronLeft, AlertCircle, CheckCircle2, Plus } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

export default function TeacherExamDetailPage() {
    const { id } = useParams();
    const router = useRouter();

    const { data: exam, isLoading: examLoading } = useQuery({
        queryKey: ["exam", id],
        queryFn: () => ExamService.getExamById(id as string),
    });

    const { data: subjects = [] } = useQuery({
        queryKey: ["subjects"],
        queryFn: () => SettingsService.getSubjects(),
        staleTime: 60 * 60 * 1000,
    });

    const [availableCounts, setAvailableCounts] = useState<Record<string, number>>({});
    const [countsLoading, setCountsLoading] = useState(false);

    useEffect(() => {
        const fetchCounts = async () => {
            if (!exam?.grade || !exam?.subjectDistribution?.length) return;

            setCountsLoading(true);
            try {
                const subjectIds = exam.subjectDistribution.map(d => d.subjectId);
                const counts = await QuestionService.getQuestionCounts(exam.grade, subjectIds);
                setAvailableCounts(counts);
            } catch (error) {
                console.error("Error fetching counts:", error);
            } finally {
                setCountsLoading(false);
            }
        };

        fetchCounts();
    }, [exam]);

    const subjectsMap = useMemo(() => {
        const map: Record<string, string> = {};
        subjects.forEach(s => map[s.id] = s.name);
        return map;
    }, [subjects]);

    if (examLoading) return <div className="p-8 text-center">Уншиж байна...</div>;
    if (!exam) return <div className="p-8 text-center text-red-500">Шалгалт олдсонгүй.</div>;

    const totalDeficit = exam.subjectDistribution?.reduce((acc, dist) => {
        const available = availableCounts[dist.subjectId] || 0;
        return acc + Math.max(0, dist.count - available);
    }, 0) || 0;

    return (
        <div className="space-y-6 pb-12">
            <div className="flex items-center justify-between mb-4">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="gap-2 text-slate-600 hover:text-slate-900"
                >
                    <ChevronLeft className="w-5 h-5" />
                    Буцах
                </Button>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                {exam.grade}-р анги
                            </span>
                            <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-semibold">
                                {new Date(exam.scheduledAt).toLocaleDateString()}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900">{exam.title}</h1>
                        <p className="text-slate-500 mt-2">
                            Шалгалтанд төлөвлөгдсөн асуултуудын нөөцийг хянах
                        </p>
                    </div>
                    {totalDeficit > 0 ? (
                        <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex flex-col items-center">
                            <div className="text-red-600 font-bold text-base mb-1">Дутуу асуулт</div>
                            <div className="text-3xl font-black text-red-600">{totalDeficit}</div>
                        </div>
                    ) : (
                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex flex-col items-center">
                            <div className="text-emerald-600 font-bold text-base mb-1">Нөөц бүрэн</div>
                            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                        </div>
                    )}
                </div>
            </div>

            <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-200 py-4">
                    <CardTitle className="text-lg">Асуултын хуваарилалт</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Сэдвийн нэр</th>
                                <th className="px-6 py-4 text-center">Төлөвлөсөн тоо</th>
                                <th className="px-6 py-4 text-center">Датабааз дэх тоо</th>
                                <th className="px-6 py-4 text-center">Төлөв</th>
                                <th className="px-6 py-4 text-right">Үйлдэл</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {exam.subjectDistribution?.map((dist) => {
                                const available = availableCounts[dist.subjectId] || 0;
                                const isDeficit = dist.count > available;
                                const deficitCount = dist.count - available;

                                return (
                                    <tr key={dist.subjectId} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-slate-900">
                                            {subjectsMap[dist.subjectId] || "Устгагдсан сэдэв"}
                                        </td>
                                        <td className="px-6 py-4 text-center tabular-nums font-bold text-slate-700">
                                            {dist.count}
                                        </td>
                                        <td className={`px-6 py-4 text-center tabular-nums font-bold ${isDeficit ? 'text-red-500' : 'text-emerald-600'}`}>
                                            {countsLoading ? "..." : available}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">
                                                {isDeficit ? (
                                                    <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-bold border border-red-100">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        {deficitCount} дутуу
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Хүрэлцээтэй
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link href={`/teacher/questions/create?subjectId=${dist.subjectId}&gradeId=${exam.grade}`}>
                                                <Button size="sm" variant="outline" className="gap-2 text-xs font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Асуулт нэмэх
                                                </Button>
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center gap-4">
                <div className="p-2 bg-blue-600 rounded-lg">
                    <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h4 className="font-bold text-blue-900 text-base">Мэдээлэл</h4>
                    <p className="text-blue-700 text-sm">Багш нар энэ хэсэгт зөвхөн асуултын нөөцийг хянах боломжтой. Шалгалтын асуултын агуулгыг харах боломжгүй.</p>
                </div>
            </div>
        </div>
    );
}
