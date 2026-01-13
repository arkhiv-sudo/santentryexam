"use client";

import { useEffect } from "react";
import { ExamService } from "@/lib/services/exam-service";
import { Exam } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function ExamsPage() {
    const queryClient = useQueryClient();
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();

    const { data: exams = [], isLoading: loading } = useQuery({
        queryKey: ["exams"],
        queryFn: () => ExamService.getAllExams(),
        staleTime: 15 * 60 * 1000, // 15 minutes
    });

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    const handleDelete = async (id: string) => {
        if (!confirm("Та энэ шалгалтыг устгахдаа итгэлтэй байна уу?")) return;
        try {
            await ExamService.deleteExam(id);
            queryClient.invalidateQueries({ queryKey: ["exams"] });
            toast.success("Шалгалт амжилттай устгагдлаа");
        } catch (error) {
            toast.error("Шалгалтыг устгахад алдаа гарлаа");
        }
    };

    const handleStatusChange = async (examId: string, newStatus: Exam["status"]) => {
        try {
            await ExamService.updateExam(examId, { status: newStatus });
            queryClient.invalidateQueries({ queryKey: ["exams"] });
            toast.success("Төлөв амжилттай шинэчлэгдлээ");
        } catch (error) {
            toast.error("Төлөв өөрчлөхөд алдаа гарлаа");
        }
    };

    if (authLoading || loading) return <div className="p-8 text-center">Уншиж байна...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-50 to-blue-50 p-8 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden mb-8">
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                            Шалгалтууд
                        </h1>
                        <p className="text-slate-500 mt-2 text-lg font-medium">Шалгалтын хуваарь болон удирдлага</p>
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
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Шалгалтуудыг ачаалж байна...</td>
                                    </tr>
                                ) : exams.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Шалгалт олдсонгүй. "Шинэ шалгалт үүсгэх" товчийг дарж эхэлнэ үү.</td>
                                    </tr>
                                ) : (
                                    exams.map((exam) => (
                                        <tr key={exam.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">{exam.title}</td>
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
                                                            exam.status === 'archived' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}`}
                                                >
                                                    <option value="draft">Ноорог</option>
                                                    <option value="published">Нийтлэгдсэн</option>
                                                    <option value="archived">Архивлагдсан</option>
                                                </select>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-3">
                                                <Link href={`/admin/exams/edit/${exam.id}`}>
                                                    <button className="text-blue-600 hover:text-blue-900 font-medium text-xs transition-colors">Засах</button>
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(exam.id)}
                                                    className="text-red-600 hover:text-red-900 font-medium text-xs transition-colors"
                                                >
                                                    Устгах
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
