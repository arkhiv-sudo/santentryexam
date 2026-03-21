"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loader2, ArrowLeft, FileText } from "lucide-react";
import MathRenderer from "@/components/exam/MathRenderer";

interface GradedAnswer {
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    points: number;
    earnedPoints: number;
}

interface SubmissionData {
    studentName: string;
    score: number;
    maxScore: number;
    percentage: number;
    passed: boolean;
    gradedAnswers: Record<string, GradedAnswer>;
}

export default function ParentExamReviewPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    const examId = params.examId as string;
    const studentId = searchParams.get("studentId");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [examData, setExamData] = useState<import("@/types").Exam | null>(null);
    const [submissionData, setSubmissionData] = useState<SubmissionData | null>(null);

    useEffect(() => {
        if (!examId || !studentId) {
            setError("Шалгалтын мэдээлэл олдсонгүй.");
            setLoading(false);
            return;
        }

        const fetchReviewData = async () => {
            try {
                // 1. Fetch exam for question details
                const examDoc = await getDoc(doc(db, "exams", examId));
                if (!examDoc.exists()) {
                    throw new Error("Шалгалт олдсонгүй");
                }
                const examData = examDoc.data();
                setExamData(examData as import("@/types").Exam);

                // 2. Fetch submission for this student and exam
                const q = query(
                    collection(db, "submissions"),
                    where("examId", "==", examId),
                    where("studentId", "==", studentId)
                );
                const querySnapshot = await getDocs(q);
                
                if (querySnapshot.empty) {
                    throw new Error("Сурагчийн хариулт олдсонгүй.");
                }

                // Just take the first valid submission (should be only one per student anyway)
                setSubmissionData(querySnapshot.docs[0].data() as SubmissionData);

            } catch (err: unknown) {
                console.error("Failed to load review data", err);
                setError(err instanceof Error ? err.message : "Хариулт уншихад алдаа гарлаа");
            } finally {
                setLoading(false);
            }
        };

        fetchReviewData();
    }, [examId, studentId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-500">
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-violet-600" />
                <p>Хуудсыг ачаалж байна...</p>
            </div>
        );
    }

    if (error || !examData || !submissionData) {
        return (
            <div className="max-w-xl mx-auto mt-12 p-6 bg-red-50 border border-red-200 rounded-2xl text-center shadow-sm">
                <FileText className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-red-800 mb-2">{error || "Алдаа гарлаа"}</h3>
                <Button variant="outline" onClick={() => router.back()} className="mt-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Буцах
                </Button>
            </div>
        );
    }

    const snapshotQuestions = examData.questionSnapshot || [];

    return (
        <div className="pb-20 max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <Button variant="ghost" className="mb-4 text-slate-500 hover:text-slate-800 gap-2" onClick={() => router.push("/parent")}>
                    <ArrowLeft className="w-4 h-4" /> Эцэг эхийн самбар луу буцах
                </Button>
                
                <Card className="border-0 shadow-lg rounded-3xl overflow-hidden">
                    <div className="bg-linear-to-r from-violet-600 to-fuchsia-600 p-8 text-white relative">
                        <div className="relative z-10 flex flex-col md:flex-row gap-6 md:items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-black mb-1">{examData.title}</h1>
                                <p className="text-violet-200 font-medium">Сурагч: {submissionData.studentName}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-center px-6 py-3 bg-white/10 backdrop-blur rounded-2xl">
                                    <div className="text-3xl font-black">{submissionData.percentage}%</div>
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-violet-200">Гүйцэтгэл</div>
                                </div>
                                <div className="text-center px-6 py-3 bg-white/10 backdrop-blur rounded-2xl">
                                    <div className="text-xl font-black">{submissionData.score} / {submissionData.maxScore}</div>
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-violet-200">Оноо</div>
                                </div>
                            </div>
                        </div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-3xl rounded-full" />
                    </div>
                </Card>
            </div>

            {/* Questions List */}
            <div className="space-y-6">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest pl-4">Асуулт болон хариултууд</h2>
                
                {snapshotQuestions.map((q: import("@/types").ExamQuestion, i: number) => {
                    const graded = submissionData.gradedAnswers?.[q.id];
                    const isCorrect = graded?.isCorrect;
                    
                    return (
                        <Card key={q.id} className="rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                            <CardHeader className={`px-6 py-4 flex flex-row items-center justify-between ${isCorrect ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-red-50 border-b border-red-100'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-white ${isCorrect ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                        {i + 1}
                                    </div>
                                    <span className={`font-bold uppercase tracking-wider text-xs ${isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {isCorrect ? "Зөв хариулсан" : "Буруу хариулсан"}
                                    </span>
                                </div>
                                <div className={`font-black text-sm ${isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {graded ? graded.earnedPoints : 0} / {q.points || 1} оноо
                                </div>
                            </CardHeader>
                            <CardContent className="p-8">
                                {/* Question Content */}
                                <div className="text-slate-800 font-medium leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <MathRenderer content={q.content || "Асуултын агуулга байхгүй"} />
                                </div>

                                {/* Question Media */}
                                {q.mediaUrl && (
                                    <div className="mt-4 rounded-xl overflow-hidden border border-slate-100 p-2 max-w-xl mx-auto">
                                        {q.mediaType === "image" && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={q.mediaUrl} loading="lazy" alt="Media" className="w-full h-auto object-contain rounded-lg max-h-64" />
                                        )}
                                        {q.mediaType === "video" && <video src={q.mediaUrl} controls className="w-full h-auto rounded-lg max-h-64" />}
                                        {q.mediaType === "audio" && <audio src={q.mediaUrl} controls className="w-full" />}
                                    </div>
                                )}

                                {/* Divider */}
                                <hr className="my-8 border-slate-100 border-dashed" />

                                {/* Answers Section */}
                                <div className="grid sm:grid-cols-2 gap-6">
                                    {/* Student's Answer */}
                                    <div className={`p-5 rounded-2xl border-2 ${isCorrect ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'}`}>
                                        <p className={`text-[10px] uppercase font-black tracking-widest mb-2 ${isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>Сурагчийн хариулт</p>
                                        <div className="font-bold text-slate-800">
                                            {graded?.studentAnswer ? (
                                                <MathRenderer content={graded.studentAnswer} />
                                            ) : (
                                                <span className="text-slate-400 italic">Хариулаагүй</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Correct Answer */}
                                    <div className="p-5 rounded-2xl bg-blue-50/50 border-2 border-blue-200">
                                        <p className="text-[10px] uppercase text-blue-600 font-black tracking-widest mb-2">Зөв хариулт</p>
                                        <div className="font-bold text-slate-800">
                                            {graded?.correctAnswer ? (
                                                <MathRenderer content={graded.correctAnswer} />
                                            ) : (
                                                <span className="text-slate-400 italic">Тодорхойгүй</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {snapshotQuestions.length === 0 && (
                    <div className="text-center p-12 bg-white rounded-3xl border border-slate-200">
                        <p className="text-slate-400 font-medium">Энэ шалгалтад хадгалагдсан асуултын мэдээлэл байхгүй байна.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
