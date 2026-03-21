'use client';

import { useEffect, useState } from "react";
import { ExamService } from "@/lib/services/exam-service";
// import { Exam } from "@/types";
// import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "@/lib/services/question-service";
import { Calendar, Clock, BookOpen, AlertCircle, ChevronRight } from "lucide-react";

export default function TeacherExamsPage() {
    const { data: exams = [], isLoading: loading } = useQuery({
        queryKey: ["exams"],
        queryFn: () => ExamService.getAllExams(),
        staleTime: 15 * 60 * 1000,
    });

    const [availableCounts, setAvailableCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        const fetchAllCounts = async () => {
            if (exams.length === 0) return;

            const pairs: { grade: string, subjectId: string }[] = [];
            exams.forEach(exam => {
                exam.subjectDistribution?.forEach(dist => {
                    if (!pairs.find(p => p.grade === exam.grade && p.subjectId === dist.subjectId)) {
                        pairs.push({ grade: exam.grade, subjectId: dist.subjectId });
                    }
                });
            });

            if (pairs.length === 0) return;

            try {
                const gradeGroups: Record<string, string[]> = {};
                pairs.forEach(p => {
                    if (!gradeGroups[p.grade]) gradeGroups[p.grade] = [];
                    gradeGroups[p.grade].push(p.subjectId);
                });

                const allCounts: Record<string, number> = {};
                await Promise.all(Object.entries(gradeGroups).map(async ([grade, subjectIds]) => {
                    const counts = await QuestionService.getQuestionCounts(grade, subjectIds);
                    Object.entries(counts).forEach(([subId, count]) => {
                        allCounts[`${grade}_${subId}`] = count;
                    });
                }));

                setAvailableCounts(allCounts);
            } catch (error) {
                console.error("Failed to fetch all available counts:", error);
            }
        };

        if (exams.length > 0) {
            fetchAllCounts();
        }
    }, [exams]);

    return (
        <div className="space-y-6">
            <div className="bg-linear-to-r from-slate-50 to-blue-50 p-8 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden mb-8">
                <div className="relative z-10">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        Шалгалтуудын жагсаалт
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-medium">Шалгалтын асуултын дутууг хянах</p>
                </div>
                <div className="absolute right-0 top-0 w-64 h-64 bg-blue-100/50 rounded-full blur-3xl -mr-32 -mt-32"></div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="animate-pulse h-48 bg-slate-100 border-0" />
                    ))
                ) : exams.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-500 italic">
                        Шалгалт олдсонгүй.
                    </div>
                ) : (
                    exams.map((exam) => {
                        let totalDeficit = 0;
                        exam.subjectDistribution?.forEach(dist => {
                            const available = availableCounts[`${exam.grade}_${dist.subjectId}`] || 0;
                            if (dist.count > available) {
                                totalDeficit += (dist.count - available);
                            }
                        });

                        return (
                            <Link key={exam.id} href={`/teacher/exams/${exam.id}`}>
                                <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200 overflow-hidden cursor-pointer h-full hover:-translate-y-1">
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                                {exam.grade}-р анги
                                            </span>
                                            {exam.status === 'published' ? (
                                                <span className="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border border-emerald-100">
                                                    Нийтлэгдсэн
                                                </span>
                                            ) : (
                                                <span className="bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border border-amber-100">
                                                    Ноорог
                                                </span>
                                            )}
                                        </div>
                                        <CardTitle className="text-xl group-hover:text-blue-600 transition-colors line-clamp-2 min-h-14">
                                            {exam.title}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex flex-col gap-2.5">
                                            <div className="flex items-center text-slate-500 text-sm gap-2">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                {new Date(exam.scheduledAt).toLocaleDateString()}
                                            </div>
                                            <div className="flex items-center text-slate-500 text-sm gap-2">
                                                <Clock className="w-4 h-4 text-slate-400" />
                                                {exam.duration} минут
                                            </div>
                                            <div className="flex items-center text-slate-500 text-sm gap-2">
                                                <BookOpen className="w-4 h-4 text-slate-400" />
                                                Нийт {exam.maxQuestions || 0} асуулт
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                            {totalDeficit > 0 ? (
                                                <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                                                    <AlertCircle className="w-4 h-4" />
                                                    {totalDeficit} асуулт дутуу
                                                </div>
                                            ) : (
                                                <div className="text-emerald-600 font-bold text-sm">
                                                    Асуултын нөөц: Бүрэн
                                                </div>
                                            )}
                                            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })
                )}
            </div>
        </div>
    );
}
