"use client";

import { useState, useEffect } from "react";
import { QuestionService } from "@/lib/services/question-service";
import { Question, QuestionType } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";

export default function QuestionsPage() {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
    const [displayQuestions, setDisplayQuestions] = useState<Question[]>([]);
    const router = useRouter();

    useEffect(() => {
        loadQuestions();
    }, []);

    useEffect(() => {
        filterQuestions();
    }, [questions, searchTerm, typeFilter]);

    const loadQuestions = async () => {
        try {
            const data = await QuestionService.getAllQuestions();
            setQuestions(data);
        } catch (error) {
            console.error("Failed to load questions", error);
        } finally {
            setLoading(false);
        }
    };

    const filterQuestions = () => {
        let filtered = questions;

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(q =>
                q.content.toLowerCase().includes(lowerTerm) ||
                q.category?.toLowerCase().includes(lowerTerm)
            );
        }

        if (typeFilter !== "all") {
            filtered = filtered.filter(q => q.type === typeFilter);
        }

        setDisplayQuestions(filtered);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Та энэ асуултыг устгахдаа итгэлтэй байна уу?")) return;
        try {
            await QuestionService.deleteQuestion(id);
            setQuestions(prev => prev.filter(q => q.id !== id));
            toast.success("Асуулт амжилттай устгагдлаа");
        } catch (error) {
            toast.error("Асуултыг устгахад алдаа гарлаа");
        }
    };

    const typeLabels: Record<QuestionType, string> = {
        multiple_choice: "Сонгох",
        text: "Бичвэр",
        fill_in_the_blank: "Нөхөх",
        listening: "Сонсох"
    };

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-50 to-blue-50 p-8 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden mb-8">
                <div className="relative z-10">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        Асуултын сан
                    </h1>
                    <p className="text-slate-500 mt-2 text-lg font-medium">Бух шалгалтын асуултыг удирдах, зохион байгуулах</p>
                </div>
                <div className="absolute right-0 top-0 w-64 h-64 bg-blue-100/50 rounded-full blur-3xl -mr-32 -mt-32"></div>
            </div>

            <Card className="bg-white shadow-xl border-0">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row gap-4 justify-between">
                        <Input
                            placeholder="Асуулт хайх..."
                            className="max-w-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as any)}
                            className="min-w-[180px]"
                        >
                            <option value="all">Бүх төрөл</option>
                            <option value="multiple_choice">Сонгох асуулт</option>
                            <option value="text">Бичвэр / Эссе</option>
                            <option value="fill_in_the_blank">Нөхөх асуулт</option>
                            <option value="listening">Сонсох даалгавар</option>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-gray-100 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-900 font-semibold border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3">Агуулга</th>
                                    <th className="px-4 py-3 w-32">Төрөл</th>
                                    <th className="px-4 py-3 w-32">Ангилал</th>
                                    <th className="px-4 py-3 w-20 text-center">Оноо</th>
                                    <th className="px-4 py-3 w-24 text-right">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Асуултуудыг ачаалж байна...</td>
                                    </tr>
                                ) : displayQuestions.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Асуулт олдсонгүй.</td>
                                    </tr>
                                ) : (
                                    displayQuestions.map((q) => (
                                        <tr key={q.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-900">
                                                <div className="line-clamp-2" title={q.content}>{q.content}</div>
                                                {q.mediaUrl && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 mt-1">
                                                        Медиа: {q.mediaType}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">{typeLabels[q.type] || q.type}</td>
                                            <td className="px-4 py-3 text-gray-500">{q.category || "-"}</td>
                                            <td className="px-4 py-3 text-center text-gray-500">{q.points || 1}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => handleDelete(q.id)}
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
                    <div className="mt-4 text-xs text-gray-500">
                        {questions.length} асуултаас {displayQuestions.length}-ийг харуулж байна
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
