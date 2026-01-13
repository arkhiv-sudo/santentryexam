"use client";

import { useState, useEffect, useMemo } from "react";
import { QuestionService } from "@/lib/services/question-service";
import { Question, QuestionType, UserProfile } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Trash2, Search, Filter, Edit, Plus, Loader2 } from "lucide-react";
import { SettingsService } from "@/lib/services/settings-service";
import { Grade, Subject } from "@/types";
import MathRenderer from "@/components/exam/MathRenderer";
import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const PAGE_SIZE = 10;

const GRADES_MAP: Record<string, string> = {
    "1": "1-р анги", "2": "2-р анги", "3": "3-р анги", "4": "4-р анги",
    "5": "5-р анги", "6": "6-р анги", "7": "7-р анги", "8": "8-р анги",
    "9": "9-р анги", "10": "10-р анги", "11": "11-р анги", "12": "12-р анги"
};

export default function QuestionsPage() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
    const [gradeFilter, setGradeFilter] = useState<string | "all">("all");
    const [subjectFilter, setSubjectFilter] = useState<string | "all">("all");
    const [authorFilter, setAuthorFilter] = useState<string | "all">("all");
    const [currentPage, setCurrentPage] = useState(0);
    const [lastVisibleDocs, setLastVisibleDocs] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([]);
    // Fetch Authors with Caching
    const { data: authors = [] } = useQuery({
        queryKey: ["authors_list"],
        queryFn: () => QuestionService.getUsersByRoles(["admin", "teacher"]),
        staleTime: 5 * 60 * 1000,
    });

    // Reset pagination when filter changes
    useEffect(() => {
        setCurrentPage(0);
        setLastVisibleDocs([]);
    }, [typeFilter, gradeFilter, subjectFilter, authorFilter]);

    const router = useRouter();

    // Fetch Subjects with Caching
    const { data: subjectsData = [] } = useQuery({
        queryKey: ["subjects_list"],
        queryFn: () => SettingsService.getSubjects(),
        staleTime: 5 * 60 * 1000,
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
        queryKey: ["admin_questions", typeFilter, gradeFilter, subjectFilter, authorFilter, currentPage],
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
        placeholderData: (previousData) => previousData,
    });
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
                queryKey: ["admin_questions", typeFilter, gradeFilter, subjectFilter, authorFilter, nextPage],
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

    const [isMigrating, setIsMigrating] = useState(false);

    const runMigration = async () => {
        if (!confirm("Хуучин асуултуудад огноо нөхөж оруулах уу?")) return;
        setIsMigrating(true);
        try {
            const count = await QuestionService.migrateLegacyQuestions();
            toast.success(`${count} асуултыг шинэчиллээ.`);
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
        } catch (error) {
            toast.error("Migration failed");
        } finally {
            setIsMigrating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Та энэ асуултыг устгахдаа итгэлтэй байна уу?")) return;
        try {
            await QuestionService.deleteQuestion(id);
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
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
            <div className="bg-gradient-to-r from-slate-50 to-blue-50 p-8 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden mb-8">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                            Асуултын сан
                        </h1>
                        <p className="text-slate-500 mt-2 text-lg font-medium">Бүх шалгалтын асуултыг удирдах, зохион байгуулах</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={runMigration}
                            disabled={isMigrating}
                            className="bg-white/50 backdrop-blur-sm border-blue-200 hover:bg-white text-blue-700 font-bold"
                        >
                            {isMigrating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Data Migration
                        </Button>
                        <Button onClick={() => router.push("/teacher/questions/create")} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-200">
                            <Plus className="w-4 h-4 mr-2" /> Асуулт нэмэх
                        </Button>
                    </div>
                </div>
                <div className="absolute right-0 top-0 w-64 h-64 bg-blue-100/50 rounded-full blur-3xl -mr-32 -mt-32"></div>
            </div>

            <Card className="bg-white shadow-xl border-0">
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
                    <div className="rounded-md border border-gray-100 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-900 font-semibold border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3">Агуулга</th>
                                    <th className="px-4 py-3 w-32">Төрөл</th>
                                    <th className="px-4 py-3 w-32">Сэдэв</th>
                                    <th className="px-4 py-3 w-24">Анги</th>
                                    <th className="px-4 py-3 w-32 text-left">Багш</th>
                                    <th className="px-4 py-3 w-32 text-left">Огноо</th>
                                    <th className="px-4 py-3 w-20 text-center">Оноо</th>
                                    <th className="px-4 py-3 w-24 text-right">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                                Асуултуудыг ачаалж байна...
                                            </div>
                                        </td>
                                    </tr>
                                ) : isError ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-red-500">
                                            <p className="font-bold">Алдаа гарлаа</p>
                                            <p className="text-sm opacity-80">{(error as any)?.message || "Өгөгдлийг татахад алдаа гарлаа"}</p>
                                            <button
                                                onClick={() => queryClient.invalidateQueries({ queryKey: ["admin_questions"] })}
                                                className="mt-4 text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-all"
                                            >
                                                Дахин оролдох
                                            </button>
                                        </td>
                                    </tr>
                                ) : displayQuestions.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500 italic">Асуулт олдсонгүй.</td>
                                    </tr>
                                ) : (
                                    displayQuestions.map((q) => (
                                        <tr key={q.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-900">
                                                <div className="line-clamp-2 max-h-12 overflow-hidden" title={q.content}>
                                                    <MathRenderer content={q.content} />
                                                </div>
                                                {q.mediaUrl && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 mt-1">
                                                        Медиа: {q.mediaType}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">{typeLabels[q.type] || q.type}</td>
                                            <td className="px-4 py-3 text-gray-500 truncate max-w-[120px]">{(q.subject && subjectsMap[q.subject]) || q.subject || "-"}</td>
                                            <td className="px-4 py-3 text-gray-500">{(q.grade && GRADES_MAP[q.grade]) || q.grade || "-"}</td>
                                            <td className="px-4 py-3 text-gray-500 italic text-xs">
                                                {q.createdBy ? (
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                                                        {authors.find(a => a.uid === q.createdBy)?.lastName.charAt(0)}.{authors.find(a => a.uid === q.createdBy)?.firstName || "N/A"}
                                                    </span>
                                                ) : "-"}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                                                {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "-"}
                                            </td>
                                            <td className="px-4 py-3 text-center text-gray-500">{q.points || 1}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-3 font-medium text-xs">
                                                    <Link href={`/teacher/questions/edit/${q.id}`} className="text-blue-600 hover:text-blue-900">
                                                        Засах
                                                    </Link>
                                                    <button
                                                        onClick={() => handleDelete(q.id)}
                                                        className="text-red-600 hover:text-red-900 transition-colors"
                                                    >
                                                        Устгах
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {(!loading || isFetching) && questions.length > 0 && (
                        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100 pt-6">
                            <div className="flex items-center gap-3">
                                <div className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                    Нийт {totalCount} асуултаас {currentPage * PAGE_SIZE + 1} - {Math.min((currentPage * PAGE_SIZE) + displayQuestions.length, totalCount)} хүртэл харуулж байна
                                </div>
                                {isFetching && (
                                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePrev}
                                    disabled={currentPage === 0 || isFetching}
                                    className="flex items-center gap-1 px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Өмнөх
                                </button>

                                <div className="flex items-center gap-1 px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold text-blue-600">
                                    {currentPage + 1}
                                </div>

                                <button
                                    onClick={handleNext}
                                    disabled={!hasNext || isFetching}
                                    className="flex items-center gap-1 px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase"
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
