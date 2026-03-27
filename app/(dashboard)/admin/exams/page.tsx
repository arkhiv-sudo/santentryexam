"use client";

import { useEffect, useState } from "react";
import { ExamService } from "@/lib/services/exam-service";
import { ArchiveService } from "@/lib/services/archive-service";
import { Exam } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { QuestionService } from "@/lib/services/question-service";
import { useConfirm } from "@/components/providers/ModalProvider";
import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";

export default function ExamsPage() {
    const queryClient = useQueryClient();
    const router = useRouter();
    const confirm = useConfirm();
    const { profile, loading: authLoading } = useAuth();

    const { data: exams = [], isLoading: loading } = useQuery({
        queryKey: ["exams"],
        queryFn: () => ExamService.getAllExams(),
        staleTime: 15 * 60 * 1000, // 15 minutes
    });

    const [availableCounts, setAvailableCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        const fetchAllCounts = async () => {
            if (exams.length === 0) return;

            // Collect unique grade-subject pairs
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
                // Fetch counts for all unique subjects in their respective grades
                // Grouping by grade to use getQuestionCounts
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

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: "Устгахыг баталгаажуулах",
            message: "Та энэ шалгалтыг устгахдаа итгэлтэй байна уу?",
            confirmLabel: "Устгах",
            variant: "destructive"
        });

        if (!confirmed) return;
        try {
            await ExamService.deleteExam(id);
            queryClient.invalidateQueries({ queryKey: ["exams"] });
            toast.success("Шалгалт амжилттай устгагдлаа");
        } catch {
            toast.error("Шалгалтыг устгахад алдаа гарлаа");
        }
    };

    const handleArchive = async (id: string) => {
        const confirmed = await confirm({
            title: "Архивлахыг баталгаажуулах",
            message: "Та энэ шалгалтыг архивлахдаа итгэлтэй байна уу? Архивлагдсан шалгалт идэвхтэй жагсаалтаас хасагдаж архивт хадгалагдана.",
            confirmLabel: "Архивлах",
            variant: "default"
        });

        if (!confirmed) return;
        try {
            toast.loading("Архивлож байна...", { id: "archiveToast" });
            await ArchiveService.archiveExam(id);
            queryClient.invalidateQueries({ queryKey: ["exams"] });
            toast.success("Шалгалт амжилттай архивлагдлаа", { id: "archiveToast" });
        } catch (error) {
            console.error(error);
            toast.error("Шалгалтыг архивлах үед алдаа гарлаа", { id: "archiveToast" });
        }
    };

    const handleStatusChange = async (examId: string, newStatus: Exam["status"]) => {
        try {
            await ExamService.updateExam(examId, { status: newStatus });
            queryClient.invalidateQueries({ queryKey: ["exams"] });
            toast.success("Төлөв амжилттай шинэчлэгдлээ");
        } catch {
            toast.error("Төлөв өөрчлөхөд алдаа гарлаа");
        }
    };

    const [reassigningExamId, setReassigningExamId] = useState<string | null>(null);

    const handleReassignQuestions = async (examId: string) => {
        const confirmed = await confirm({
            title: "Асуулт дахин оноох",
            message: "Шалгалтын асуултуудыг нөөцөөс дахин санамсаргүй сонгон оноох уу? Өмнөх оноолт солигдоно.",
            confirmLabel: "Дахин оноох",
        });
        if (!confirmed) return;
        setReassigningExamId(examId);
        try {
            const reassign = httpsCallable(functions, "reassignExamQuestions");
            await reassign({ examId });
            queryClient.invalidateQueries({ queryKey: ["exams"] });
            toast.success("Асуулт амжилттай дахин оноогдлоо");
        } catch (err) {
            toast.error(`Алдаа гарлаа: ${(err as Error).message}`);
        } finally {
            setReassigningExamId(null);
        }
    };

    if (authLoading || loading) return <div className="p-8 text-center">Уншиж байна...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-linear-to-r from-slate-50 to-blue-50/50 px-6 py-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden mb-6">
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                            Шалгалтууд
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">Шалгалтын хуваарь болон удирдлага</p>
                    </div>
                    <Link href="/admin/exams/create">
                        <Button className="bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow-lg">Шинэ шалгалт үүсгэх</Button>
                    </Link>
                </div>
                <div className="absolute right-0 top-0 w-64 h-64 bg-blue-100/50 rounded-full blur-3xl -mr-32 -mt-32"></div>
            </div>

            <Card className="bg-white shadow-xl border-0">
                <CardContent className="p-0">
                    <div className="border-t border-gray-100">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-900 font-semibold border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4">Гарчиг</th>
                                    <th className="px-6 py-4 text-center">Анги</th>
                                    <th className="px-6 py-4">Товлосон огноо</th>
                                    <th className="px-6 py-4">Үргэлжлэх хугацаа</th>
                                    <th className="px-6 py-4 text-center">Асуултууд</th>
                                    <th className="px-6 py-4">Төлөв</th>
                                    <th className="px-6 py-4 text-right">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {exams.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Шалгалт олдсонгүй. &quot;Шинэ шалгалт үүсгэх&quot; товчийг дарж эхэлнэ үү.</td>
                                    </tr>
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
                                            <tr key={exam.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">{exam.title}</div>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        {totalDeficit > 0 ? (
                                                            <span className="text-[10px] bg-red-50 text-red-900 px-1.5 py-0.5 rounded font-bold border border-red-100 flex items-center gap-1">
                                                                <span className="w-1 h-1 rounded-full bg-red-600 animate-pulse" />
                                                                {totalDeficit} асуулт дутуу
                                                            </span>
                                                        ) : exam.subjectDistribution && exam.subjectDistribution.length > 0 ? (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-100">
                                                                Асуултын нөөц: Бүрэн
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600">
                                                        {exam.grade}-р анги
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-gray-500">
                                                    {new Date(exam.scheduledAt).toLocaleDateString()} {new Date(exam.scheduledAt).toLocaleTimeString()}
                                                </td>
                                                <td className="px-6 py-4 text-gray-500">{exam.duration} минут</td>
                                                <td className="px-6 py-4 text-center text-gray-500">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                        {exam.maxQuestions || 0}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={exam.status}
                                                        onChange={(e) => handleStatusChange(exam.id, e.target.value as Exam["status"])}
                                                        className={`text-xs font-medium rounded-full px-2 py-1 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer
                                                            ${exam.status === 'published' ? 'bg-green-100 text-green-800' :
                                                                exam.status === 'archived' ? 'bg-gray-100 text-gray-800' :
                                                                exam.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                                                                'bg-yellow-100 text-yellow-800'}`}
                                                    >
                                                        <option value="draft">Ноорог</option>
                                                        <option value="published">Нийтлэгдсэн</option>
                                                        <option value="completed">Дууссан</option>
                                                        <option value="archived">Архивлагдсан</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        {exam.status === "published" && (
                                                            <button
                                                                onClick={() => handleReassignQuestions(exam.id)}
                                                                disabled={reassigningExamId === exam.id}
                                                                className="text-amber-600 hover:text-amber-900 font-medium text-xs transition-colors disabled:opacity-50"
                                                                title="Асуулт дахин оноох"
                                                            >
                                                                {reassigningExamId === exam.id ? "..." : "Дахин оноох"}
                                                            </button>
                                                        )}
                                                        <Link href={`/admin/exams/${exam.id}/monitor`}>
                                                            <button className="text-emerald-600 hover:text-emerald-900 font-medium text-xs transition-colors">Хянах</button>
                                                        </Link>
                                                        <Link href={`/admin/exams/edit/${exam.id}`}>
                                                            <button className="text-blue-600 hover:text-blue-900 font-medium text-xs transition-colors">Засах</button>
                                                        </Link>
                                                        <button
                                                            onClick={() => handleArchive(exam.id)}
                                                            className="text-violet-600 hover:text-violet-900 font-medium text-xs transition-colors"
                                                        >
                                                            Архивлах
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(exam.id)}
                                                            className="text-red-600 hover:text-red-900 font-medium text-xs transition-colors"
                                                        >
                                                            Устгах
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
