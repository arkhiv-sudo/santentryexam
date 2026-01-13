"use client";

import { QuestionForm } from "@/components/QuestionForm";
import { QuestionService } from "@/lib/services/question-service";
import { Question } from "@/types";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, use } from "react";
import { toast } from "sonner";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function EditQuestionPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const queryClient = useQueryClient();

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
            await QuestionService.updateQuestion(id, data);
            queryClient.invalidateQueries({ queryKey: ["questions"] });
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
            queryClient.invalidateQueries({ queryKey: ["question", id] });
            toast.success("Асуулт амжилттай шинэчлэгдлээ");
            router.push("/teacher/questions");
        } catch (error) {
            console.error("Failed to update question", error);
            toast.error("Асуултыг шинэчлэхэд алдаа гарлаа");
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

    return (
        <div className="max-w-5xl mx-auto py-8">
            <QuestionForm initialData={question} onSubmit={handleSubmit} loading={submitting} />
        </div>
    );
}
