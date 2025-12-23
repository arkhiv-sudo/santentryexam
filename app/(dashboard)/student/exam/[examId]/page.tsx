"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import MathRenderer from "@/components/exam/MathRenderer";
import { toast } from "sonner";

interface Question {
    id: string;
    type: 'multiple_choice' | 'text' | 'listening';
    content: string;
    options: string[];
    mediaUrl?: string;
}

interface Exam {
    id: string;
    title: string;
    duration: number;
    questions: Question[];
}

export default function ExamPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const params = useParams();
    const router = useRouter();
    const examId = params.examId as string;

    const [exam, setExam] = useState<Exam | null>(null);
    const [loading, setLoading] = useState(true);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [started, setStarted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!authLoading && !user) router.push("/login");
    }, [user, authLoading, router]);

    useEffect(() => {
        const fetchExam = async () => {
            try {
                const docRef = doc(db, "exams", examId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setExam({ id: docSnap.id, ...data } as Exam);
                    setTimeLeft(data.duration * 60);
                } else {
                    toast.error("Шалгалт олдсонгүй");
                    router.push("/");
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        if (user) fetchExam();
    }, [user, examId, router]);

    useEffect(() => {
        if (started && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
            return () => clearInterval(timer);
        } else if (started && timeLeft === 0) {
            toast.error("Хугацаа дууслаа!");
            handleSubmit();
        }
    }, [started, timeLeft]);

    const handleSubmit = async () => {
        if (!user || !exam) return;
        try {
            await setDoc(doc(db, "submissions", `${examId}_${user.uid}`), {
                examId,
                studentId: user.uid,
                studentName: profile ? `${profile.firstName} ${profile.lastName}` : user.email,
                answers,
                submittedAt: Timestamp.now(),
            });
            toast.success("Шалгалт амжилттай илгээгдлээ!");
            router.push("/");
        } catch (error) {
            console.error("Submission failed", error);
            toast.error("Шалгалтыг илгээхэд алдаа гарлаа");
        }
    };

    if (loading || authLoading) return <div className="p-8">Уншиж байна...</div>;
    if (!exam) return <div className="p-8">Шалгалт олдсонгүй</div>;

    if (!started) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="max-w-md w-full">
                    <CardHeader><CardTitle>{exam.title}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <p>Үргэлжлэх хугацаа: {exam.duration} минут</p>
                        <p>Асуултууд: {exam.questions.length}</p>
                        <Button onClick={() => setStarted(true)} className="w-full">Шалгалт эхлэх</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="sticky top-0 z-10 bg-white p-4 shadow rounded flex justify-between items-center">
                    <h1 className="font-bold text-lg">{exam.title}</h1>
                    <div className={`font-mono font-bold ${timeLeft < 300 ? 'text-red-500' : 'text-gray-900'}`}>
                        Үлдсэн хугацаа: {formatTime(timeLeft)}
                    </div>
                    <Button onClick={handleSubmit} variant="secondary">Одоо илгээх</Button>
                </div>

                <div className="space-y-6">
                    {exam.questions.map((q, i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2">
                                <div className="font-medium text-lg flex gap-2">
                                    <span>{i + 1}.</span>
                                    <div className="flex-1"><MathRenderer content={q.content} /></div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {q.mediaUrl && (
                                    <div className="my-2">
                                        {q.type === 'listening' ? (
                                            <audio controls src={q.mediaUrl} className="w-full" />
                                        ) : (
                                            <img src={q.mediaUrl} alt="Асуултын зураг" className="max-w-full h-auto rounded" />
                                        )}
                                    </div>
                                )}

                                {q.type === 'multiple_choice' && (
                                    <div className="grid gap-2">
                                        {q.options.map((opt, idx) => (
                                            <label key={idx} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name={q.id}
                                                    value={opt}
                                                    checked={answers[q.id] === opt}
                                                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                                    className="h-4 w-4"
                                                />
                                                <span><MathRenderer content={opt} /></span>
                                            </label>
                                        ))}
                                    </div>
                                )}

                                {(q.type === 'text' || q.type === 'listening') && (
                                    <textarea
                                        className="w-full border rounded p-2"
                                        rows={3}
                                        placeholder="Таны хариулт..."
                                        value={answers[q.id] || ''}
                                        onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    />
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Button onClick={handleSubmit} className="w-full py-6 text-lg">Шалгалт илгээх</Button>
            </div>
        </div>
    );
}
