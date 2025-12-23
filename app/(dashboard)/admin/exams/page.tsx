"use client";

import { useState, useEffect } from "react";
import { ExamService } from "@/lib/services/exam-service";
import { Exam } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";

export default function ExamsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    useEffect(() => {
        loadExams();
    }, []);

    const loadExams = async () => {
        try {
            const data = await ExamService.getAllExams();
            setExams(data);
        } catch (error) {
            console.error("Failed to load exams", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Та энэ шалгалтыг устгахдаа итгэлтэй байна уу?")) return;
        try {
            await ExamService.deleteExam(id);
            setExams(prev => prev.filter(e => e.id !== id));
            toast.success("Шалгалт амжилттай устгагдлаа");
        } catch (error) {
            toast.error("Шалгалтыг устгахад алдаа гарлаа");
        }
    };

    const statusLabels: Record<string, string> = {
        published: "Нийтлэгдсэн",
        archived: "Архивлагдсан",
        draft: "Ноорог"
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
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Шалгалтуудыг ачаалж байна...</td>
                                    </tr>
                                ) : exams.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Шалгалт олдсонгүй. "Шинэ шалгалт үүсгэх" товчийг дарж эхэлнэ үү.</td>
                                    </tr>
                                ) : (
                                    exams.map((exam) => (
                                        <tr key={exam.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">{exam.title}</td>
                                            <td className="px-6 py-4 text-gray-500">
                                                {new Date(exam.scheduledAt).toLocaleDateString()} {new Date(exam.scheduledAt).toLocaleTimeString()}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">{exam.duration} минут</td>
                                            <td className="px-6 py-4 text-center text-gray-500">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {exam.questionIds?.length || 0}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                                    ${exam.status === 'published' ? 'bg-green-100 text-green-800' :
                                                        exam.status === 'archived' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {statusLabels[exam.status] || exam.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-3">
                                                <button className="text-blue-600 hover:text-blue-900 font-medium text-xs transition-colors">Засах</button>
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
