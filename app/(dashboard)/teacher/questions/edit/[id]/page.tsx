"use client";

import { QuestionForm } from "@/components/QuestionForm";
import { QuestionService } from "@/lib/services/question-service";
import { Question } from "@/types";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { toDate } from "@/lib/utils";
import { CheckCircle, AlertCircle } from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function EditQuestionPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();

    const { data: question, isLoading: loading } = useQuery({
        queryKey: ["question", id],
        queryFn: async () => {
            const docRef = doc(db, "questions", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() } as Question;
            }
            toast.error("Асуулт олдсонгүй");
            router.push("/teacher/questions");
            return null;
        },
        enabled: !!id,
    });

    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (data: Omit<Question, "id">) => {
        setSubmitting(true);
        try {
            // Хадгалахад автоматаар "Хянагдсан" гэж тэмдэглэнэ — багш засаж байгаа гэдэг нь хянасан гэсэн үг.
            const reviewerName = profile ? `${profile.lastName || ""} ${profile.firstName || ""}`.trim() : "";
            const payload = {
                ...data,
                reviewStatus: 'reviewed' as const,
                reviewedBy: user?.uid || null,
                reviewedByName: reviewerName,
                reviewedAt: serverTimestamp(),
            };
            await QuestionService.updateQuestion(id, payload as unknown as Partial<Question>);
            queryClient.invalidateQueries({ queryKey: ["questions"] });
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
            queryClient.invalidateQueries({ queryKey: ["question", id] });
            toast.success("Асуулт амжилттай шинэчлэгдлээ. Хянагдсан гэж тэмдэглэгдсэн.");
            router.push("/teacher/questions");
        } catch (error) {
            console.error("Failed to update question", error);
            toast.error(error instanceof Error ? error.message : "Асуултыг шинэчлэхэд алдаа гарлаа");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!question) return null;

    // Хянагдсан төлвийн харагдац
    const isReviewed = question.reviewStatus === 'reviewed';
    const reviewerName = question.reviewedByName || question.reviewedBy?.slice(0, 8);
    const reviewedAt = question.reviewedAt ? toDate(question.reviewedAt) : null;

    return (
        <div className="max-w-5xl mx-auto py-8 space-y-4">
            {/* Review status banner */}
            <div className={`flex items-start gap-3 rounded-2xl p-4 border ${
                isReviewed
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-amber-50 border-amber-200"
            }`}>
                {isReviewed ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 text-sm">
                    {isReviewed ? (
                        <>
                            <p className="font-bold text-emerald-900">Хянагдсан</p>
                            <p className="text-emerald-700 mt-1">
                                {reviewerName ? `${reviewerName}` : "Тодорхойгүй"}
                                {reviewedAt && ` · ${reviewedAt.toLocaleString("mn-MN")}`}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="font-bold text-amber-900">Хяналт хүлээж байна</p>
                            <p className="text-amber-700 mt-1">
                                Энэ асуултыг хадгалахад автоматаар <strong>&quot;Хянагдсан&quot;</strong> гэж тэмдэглэгдэх ба
                                шалгалтад орох эрхтэй болно.
                            </p>
                        </>
                    )}
                </div>
            </div>

            <QuestionForm initialData={question} onSubmit={handleSubmit} loading={submitting} />
        </div>
    );
}
