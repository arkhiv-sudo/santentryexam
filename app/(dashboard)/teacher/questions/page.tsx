"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "@/lib/services/question-service";
import { Question, QuestionType, UserProfile } from "@/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { toast } from "sonner";
import { Edit2, Trash2, Plus } from "lucide-react";
import Link from "next/link";
import { SettingsService } from "@/lib/services/settings-service";
import { Grade, Subject } from "@/types";
import MathRenderer from "@/components/exam/MathRenderer";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const PAGE_SIZE = 10;

const GRADES_MAP: Record<string, string> = {
    "1": "1-р анги", "2": "2-р анги", "3": "3-р анги", "4": "4-р анги",
    "5": "5-р анги", "6": "6-р анги", "7": "7-р анги", "8": "8-р анги",
    "9": "9-р анги", "10": "10-р анги", "11": "11-р анги", "12": "12-р анги"
};

export default function TeacherQuestionsPage() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
    const [gradeFilter, setGradeFilter] = useState<string | "all">("all");
    const [subjectFilter, setSubjectFilter] = useState<string | "all">("all");
    const [authorFilter, setAuthorFilter] = useState<string | "all">("all");
    const [currentPage, setCurrentPage] = useState(0);
    const [lastVisibleDocs, setLastVisibleDocs] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([]);

    // Fetch Authors with Caching (1 hour stable)
    const { data: authors = [] } = useQuery({
        queryKey: ["authors_list"],
        queryFn: () => QuestionService.getUsersByRoles(["admin", "teacher"]),
        staleTime: 60 * 60 * 1000,
    });

    // Reset pagination when filter changes
    useEffect(() => {
        setCurrentPage(0);
        setLastVisibleDocs([]);
    }, [typeFilter, gradeFilter, subjectFilter, authorFilter]);

    // Fetch Subjects with Caching (1 hour stable)
    const { data: subjectsData = [] } = useQuery({
        queryKey: ["subjects_list"],
        queryFn: () => SettingsService.getSubjects(),
        staleTime: 60 * 60 * 1000, // 1 hour
    });

    const subjectsMap = useMemo(() => {
        const sMap: Record<string, string> = {};
        subjectsData.forEach(s => sMap[s.id] = s.name);
        return sMap;
    }, [subjectsData]);

    const filteredSubjects = useMemo(() => {
        if (gradeFilter === "all") return subjectsData;
        return subjectsData.filter(s => !s.gradeId || s.gradeId === gradeFilter);
    }, [subjectsData, gradeFilter]);

    // Fetch Questions with Pagination & Caching
    const {
        data: paginatedData,
        isLoading: loading,
        isFetching,
        isError,
        error
    } = useQuery({
        queryKey: ["questions", typeFilter, gradeFilter, subjectFilter, authorFilter, currentPage],
        queryFn: async () => {
            const lastDoc = currentPage === 0 ? undefined : lastVisibleDocs[currentPage - 1];
            return await QuestionService.getQuestionsPaginated(
                PAGE_SIZE,
                lastDoc || undefined,
                typeFilter,
                subjectFilter,
                gradeFilter,
                authorFilter
            );
        },
        staleTime: 15 * 60 * 1000, // 15 mins
        placeholderData: (previousData) => previousData,
    });

    // Update pagination markers when data changes
    useEffect(() => {
        if (paginatedData?.lastVisible) {
            setLastVisibleDocs(prev => {
                if (prev[currentPage] === paginatedData.lastVisible) return prev;
                const next = [...prev];
                next[currentPage] = paginatedData.lastVisible;
                return next;
            });
        }
    }, [paginatedData?.lastVisible, currentPage]);

    const questions = paginatedData?.questions || [];
    const totalCount = paginatedData?.totalCount || 0;
    const hasNext = !!paginatedData?.lastVisible && (currentPage + 1) * PAGE_SIZE < totalCount;

    // Prefetch next page
    useEffect(() => {
        if (hasNext) {
            const nextPage = currentPage + 1;
            const lastDoc = paginatedData?.lastVisible;
            queryClient.prefetchQuery({
                queryKey: ["questions", typeFilter, gradeFilter, subjectFilter, authorFilter, nextPage],
                queryFn: () => QuestionService.getQuestionsPaginated(
                    PAGE_SIZE,
                    lastDoc || undefined,
                    typeFilter,
                    subjectFilter,
                    gradeFilter,
                    authorFilter
                ),
            });
        }
    }, [hasNext, currentPage, paginatedData?.lastVisible, queryClient, typeFilter, gradeFilter, subjectFilter, authorFilter]);

    const displayQuestions = useMemo(() => {
        if (!searchTerm) return questions;

        const lowerTerm = searchTerm.toLowerCase();
        return questions.filter(q =>
            q.content.toLowerCase().includes(lowerTerm) ||
            (q.subject && subjectsMap[q.subject]?.toLowerCase().includes(lowerTerm))
        );
    }, [searchTerm, questions, subjectsMap]);

    const handleNext = () => {
        if (hasNext) {
            setCurrentPage(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentPage > 0) {
            setCurrentPage(prev => prev - 1);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Та энэ асуултыг устгахдаа итгэлтэй байна уу?")) return;
        try {
            await QuestionService.deleteQuestion(id);
            queryClient.invalidateQueries({ queryKey: ["questions"] });
            toast.success("Асуулт амжилттай устгагдлаа");
        } catch (error) {
            toast.error("Асуултыг устгахад алдаа гарлаа");
        }
    };

    const typeLabels: Record<QuestionType, string> = {
        multiple_choice: "Сонгох",
        input: "Хариулах"
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Асуултын сан</h1>
                    <p className="text-slate-500 text-sm">Таны үүсгэсэн болон ашиглах боломжтой асуултууд</p>
                </div>
                <Link href="/teacher/questions/create">
                    <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
                        <Plus className="w-5 h-5" />
                        Асуулт нэмэх
                    </button>
                </Link>
            </div>

            <Card className="border-slate-200">
                <CardHeader>
                    <div className="flex flex-row items-center gap-2 w-full overflow-x-auto pb-2 sm:pb-0">
                        <div className="flex-1 min-w-[200px]">
                            <Input
                                placeholder="Асуулт хайх..."
                                className="h-9 text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select
                            value={gradeFilter}
                            onChange={(e) => {
                                setGradeFilter(e.target.value);
                                setSubjectFilter("all");
                            }}
                            className="w-32 h-9 text-sm"
                        >
                            <option value="all">Бүх анги</option>
                            {Object.entries(GRADES_MAP).map(([id, name]) => (
                                <option key={id} value={id}>{name}</option>
                            ))}
                        </Select>
                        <Select
                            value={subjectFilter}
                            onChange={(e) => setSubjectFilter(e.target.value)}
                            className="w-40 h-9 text-sm"
                        >
                            <option value="all">Бүх сэдэв</option>
                            {filteredSubjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </Select>
                        <Select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as any)}
                            className="w-32 h-9 text-sm"
                        >
                            <option value="all">Бүх төрөл</option>
                            <option value="multiple_choice">Сонгох</option>
                            <option value="input">Хариулах</option>
                        </Select>
                        <Select
                            value={authorFilter}
                            onChange={(e) => setAuthorFilter(e.target.value)}
                            className="h-9 text-sm min-w-[130px]"
                        >
                            <option value="all">Бүх багш нар</option>
                            {authors.map(a => (
                                <option key={a.uid} value={a.uid}>{a.lastName} {a.firstName}</option>
                            ))}
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Агуулга</th>
                                    <th className="px-6 py-4 w-32">Төрөл</th>
                                    <th className="px-6 py-4 w-32">Сэдэв</th>
                                    <th className="px-6 py-4 w-24">Анги</th>
                                    <th className="px-6 py-4 w-32 text-left">Багш</th>
                                    <th className="px-6 py-4 w-32 text-left">Огноо</th>
                                    <th className="px-6 py-4 w-20 text-center">Оноо</th>
                                    <th className="px-6 py-4 w-32 text-right">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                                Ачаалж байна...
                                            </div>
                                        </td>
                                    </tr>
                                ) : isError ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-red-500">
                                            <p className="font-bold">Алдаа гарлаа</p>
                                            <p className="text-sm opacity-80">{(error as any)?.message || "Өгөгдлийг татахад алдаа гарлаа"}</p>
                                            <button
                                                onClick={() => queryClient.invalidateQueries({ queryKey: ["questions"] })}
                                                className="mt-4 text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-all"
                                            >
                                                Дахин оролдох
                                            </button>
                                        </td>
                                    </tr>
                                ) : displayQuestions.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-slate-500 italic">
                                            Асуулт олдсонгүй.
                                        </td>
                                    </tr>
                                ) : (
                                    displayQuestions.map((q) => (
                                        <tr key={q.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4 font-medium text-slate-900">
                                                <div className="line-clamp-2 leading-relaxed" title={q.content}>
                                                    <MathRenderer content={q.content} />
                                                </div>
                                                {q.mediaUrl && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 mt-2 uppercase tracking-wider">
                                                        Медиа: {q.mediaType}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">
                                                <span className="bg-slate-100 px-2 py-1 rounded text-xs">
                                                    {typeLabels[q.type] || q.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 truncate max-w-[120px]">{(q.subject && subjectsMap[q.subject]) || q.subject || "-"}</td>
                                            <td className="px-6 py-4 text-slate-600">{(q.grade && GRADES_MAP[q.grade]) || q.grade || "-"}</td>
                                            <td className="px-6 py-4 text-slate-600 italic text-xs">
                                                {q.createdBy ? (
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                                                        {authors.find(a => a.uid === q.createdBy)?.lastName.charAt(0)}.{authors.find(a => a.uid === q.createdBy)?.firstName || "N/A"}
                                                    </span>
                                                ) : "-"}
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 text-xs tabular-nums">
                                                {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "-"}
                                            </td>
                                            <td className="px-6 py-4 text-center font-bold text-slate-700">{q.points || 1}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Link href={`/teacher/questions/edit/${q.id}`}>
                                                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Засах">
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                    </Link>
                                                    <button
                                                        onClick={() => handleDelete(q.id)}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                        title="Устгах"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {!loading && (
                        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-6">
                            <div className="text-xs text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                                Нийт {totalCount} асуултаас {currentPage * PAGE_SIZE + 1} - {Math.min((currentPage * PAGE_SIZE) + displayQuestions.length, totalCount)} хүртэл харуулж байна
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePrev}
                                    disabled={currentPage === 0 || isFetching}
                                    className="flex items-center gap-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Өмнөх
                                </button>

                                <div className="flex items-center gap-1 px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm font-bold text-blue-600">
                                    {currentPage + 1}
                                </div>

                                <button
                                    onClick={handleNext}
                                    disabled={!hasNext || isFetching}
                                    className="flex items-center gap-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Дараагийн
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
