"use client";

import { QuestionForm } from "@/components/QuestionForm";
import { QuestionService } from "@/lib/services/question-service";
import { Question, Subject } from "@/types";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { BulkQuestionUpload } from "@/components/BulkQuestionUpload";
import { SettingsService } from "@/lib/services/settings-service";
import { LayoutGrid, FileStack, ArrowLeft } from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function CreateQuestionPage() {
    const { user } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [submitting, setSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

    const { data: allSubjects = [] } = useQuery({
        queryKey: ["subjects_list"],
        queryFn: () => SettingsService.getSubjects(),
        staleTime: 60 * 60 * 1000, // 1 hour
    });

    const handleSubmit = async (data: Omit<Question, "id">) => {
        if (!user) {
            toast.error("Та нэвтрэх шаардлагатай");
            return;
        }

        setSubmitting(true);
        try {
            await QuestionService.createQuestion({
                ...data,
                createdBy: user.uid
            });
            queryClient.invalidateQueries({ queryKey: ["questions"] });
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
            toast.success("Асуулт амжилттай үүсгэгдлээ");
            router.push("/teacher/questions");
        } catch (error) {
            console.error("Failed to create question", error);
            toast.error("Асуулт үүсгэхэд алдаа гарлаа");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        Асуулт үүсгэх
                    </h1>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                    <button
                        onClick={() => setActiveTab('single')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'single'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        Нэгжээр
                    </button>
                    <button
                        onClick={() => setActiveTab('bulk')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'bulk'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <FileStack className="w-4 h-4" />
                        Бөөнөөр
                    </button>
                </div>
            </div>

            {activeTab === 'single' ? (
                <QuestionForm
                    onSubmit={handleSubmit}
                    loading={submitting}
                    showHeader={false}
                    showBackButton={false}
                />
            ) : (
                <BulkQuestionUpload
                    allSubjects={allSubjects}
                    onComplete={() => {
                        queryClient.invalidateQueries({ queryKey: ["questions"] });
                        queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
                        router.push("/teacher/questions");
                    }}
                />
            )}
        </div>
    );
}
