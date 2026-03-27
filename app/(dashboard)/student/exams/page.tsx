"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { ClipboardList, Trophy, Clock, Calendar, CheckCircle, AlertCircle, PlayCircle, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam } from "@/types";
import { ExamService } from "@/lib/services/exam-service";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { RetakeService, RetakeRequest } from "@/lib/services/retake-service";
import { useServerTime, formatTimeLeft } from "@/hooks/useServerTime";

export default function StudentExamsPage() {
    const { profile } = useAuth();
    const queryClient = useQueryClient();
    const now = useServerTime();

    const studentGradeNumber = useMemo(
        () => profile?.grade || profile?.class?.match(/\d+/)?.[0] || "",
        [profile?.grade, profile?.class]
    );

    const { data: exams = [], isLoading: examsLoading } = useQuery({
        queryKey: ["exams", studentGradeNumber],
        queryFn: async () => {
            if (!studentGradeNumber) return [];
            const q = query(
                collection(db, "exams"),
                where("status", "==", "published"),
                where("grade", "==", studentGradeNumber)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    scheduledAt: data.scheduledAt?.toDate ? data.scheduledAt.toDate() : new Date(data.scheduledAt),
                    registrationEndDate: data.registrationEndDate?.toDate ? data.registrationEndDate.toDate() : new Date(data.registrationEndDate)
                } as Exam;
            });
        },
        enabled: !!studentGradeNumber,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: registrations = [], isLoading: regsLoading } = useQuery({
        queryKey: ["student_registrations", profile?.uid],
        queryFn: () => ExamService.getStudentRegistrationsFull(profile!.uid),
        enabled: !!profile?.uid,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: results = [], isLoading: resultsLoading } = useQuery({
        queryKey: ["student_results", profile?.uid],
        queryFn: () => ExamService.getStudentResults(profile!.uid),
        enabled: !!profile?.uid,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const registerMutation = useMutation({
        mutationFn: (examId: string) => ExamService.registerForExam(profile!.uid, examId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["student_registrations"] });
            toast.success("Шалгалтанд амжилттай бүртгүүллээ!");
        },
        onError: () => {
            toast.error("Бүртгүүлэхэд алдаа гарлаа. Дахин оролдоно уу.");
        }
    });

    const { data: retakeRequests = [], isLoading: retakesLoading } = useQuery({
        queryKey: ["student_retake_requests", profile?.uid],
        queryFn: async () => {
            const q = query(collection(db, "retake_requests"), where("studentId", "==", profile?.uid));
            const snap = await getDocs(q);
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RetakeRequest));
        },
        enabled: !!profile?.uid,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const retakeMutation = useMutation({
        mutationFn: (exam: Exam) => RetakeService.requestRetake({
            studentId: profile!.uid,
            studentName: `${profile!.lastName} ${profile!.firstName}`,
            examId: exam.id,
            examTitle: exam.title,
            reason: "Сурагч өөрөө хүсэлт илгээсэн",
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["student_retake_requests"] });
            toast.success("Дахин өгөх хүсэлт илгээгдлээ. Админ зөвшөөрсний дараа дахин өгөх боломжтой болно.");
        },
        onError: () => {
            toast.error("Хүсэлт илгээхэд алдаа гарлаа.");
        }
    });

    const isLoading = examsLoading || regsLoading || resultsLoading || retakesLoading;

    // Separate into categories
    const completedExams = exams.filter(e => {
        const reg = registrations.find(r => r.examId === e.id);
        return reg?.status === "completed";
    });

    const upcomingExams = exams.filter(e => {
        const reg = registrations.find(r => r.examId === e.id);
        return !reg || reg.status !== "completed";
    });

    const renderExamCard = (exam: Exam) => {
        const reg = registrations.find(r => r.examId === exam.id);
        const isRegistered = !!reg;
        const isCompleted = reg?.status === "completed";
        const regEnd = new Date(exam.registrationEndDate);
        const schedule = new Date(exam.scheduledAt);
        const registrationExpired = now > regEnd;
        
        const examEndTime = new Date(schedule.getTime() + (exam.duration * 60000));
        const entryDeadline = new Date(schedule.getTime() + (10 * 60000));
        const outOfTime = now >= examEndTime;
        const hasStarted = reg?.status === "started";
        const isLate = !hasStarted && now > entryDeadline && now < examEndTime;
        const canStart = isRegistered && !isCompleted && now >= schedule && now < examEndTime && (hasStarted || now <= entryDeadline);

        const result = results.find(r => r.examId === exam.id);

        return (
            <Card key={exam.id} className="group overflow-hidden border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 rounded-xl">
                <div className={`h-1 w-full ${isCompleted ? "bg-emerald-500" : isRegistered ? "bg-blue-500" : "bg-slate-200"}`} />
                <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
                                    {exam.grade}-р анги
                                </span>
                                {isCompleted && (
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" /> Өгсөн
                                    </span>
                                )}
                                {isRegistered && !isCompleted && (
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" /> Бүртгүүлсэн
                                    </span>
                                )}
                            </div>
                            <h3 className="text-base font-bold text-slate-900 mb-2.5 group-hover:text-blue-600 transition-colors">
                                {exam.title}
                            </h3>
                            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-400" />{exam.duration} минут</span>
                                <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-indigo-400" />{exam.maxQuestions} асуулт</span>
                                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-violet-400" />{schedule.toLocaleDateString()} {schedule.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                {(exam as Exam & { passingScore?: number }).passingScore && (
                                    <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-amber-400" />Тэнцэх: {(exam as Exam & { passingScore?: number }).passingScore}%</span>
                                )}
                            </div>
                            {isCompleted && result && (
                                <div className="mt-3 flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                                    <span className="text-xs text-slate-500">Таны оноо:</span>
                                    <span className={`text-sm font-black ${result.percentage >= 80 ? "text-emerald-600" : result.percentage >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                        {result.score}/{result.maxScore} ({result.percentage}%)
                                    </span>
                                    {result.passed !== undefined && (
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${result.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                            {result.passed ? "Тэнцсэн" : "Тэнцээгүй"}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-2">
                            {isCompleted ? (
                                <>
                                    <div className="w-24 h-9 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 text-[11px] font-bold uppercase tracking-wider">
                                        Дууссан
                                    </div>
                                    {(() => {
                                        const req = retakeRequests.find((r: RetakeRequest) => r.examId === exam.id);
                                        if (req) {
                                            if (req.status === "pending") return <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded border border-amber-100">Хүсэлт хүлээгдэж буй</span>;
                                            if (req.status === "rejected") return <span className="text-[10px] text-red-500 font-bold bg-red-50 px-2 py-1 rounded border border-red-100">Хүсэлт татгалзсан</span>;
                                            return null; // requested and approved means isCompleted is false now
                                        }
                                        return (
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 text-[10px] px-2 text-slate-500 border-slate-200 hover:bg-slate-50"
                                                onClick={(e) => { e.preventDefault(); retakeMutation.mutate(exam); }}
                                                disabled={retakeMutation.isPending}
                                            >
                                                Дахин өгөх хүсэлт
                                            </Button>
                                        );
                                    })()}
                                </>
                            ) : isRegistered ? (
                                outOfTime ? (
                                    <div className="bg-red-50 px-3 py-1.5 rounded-lg flex flex-col items-end gap-0.5">
                                        <div className="flex items-center text-red-500 text-xs font-bold gap-1">
                                            <AlertCircle className="w-3.5 h-3.5" /> Хугацаа дууссан
                                        </div>
                                    </div>
                                ) : isLate ? (
                                    <div className="bg-orange-50 px-3 py-1.5 rounded-lg flex flex-col items-end gap-0.5">
                                        <div className="flex items-center text-orange-600 text-xs font-bold gap-1">
                                            <AlertCircle className="w-3.5 h-3.5" /> Хоцорсон
                                        </div>
                                        <span className="text-[10px] text-orange-500 font-medium whitespace-nowrap">10 минут өнгөрсөн</span>
                                    </div>
                                ) : canStart ? (
                                    <Link href={`/student/exam/${exam.id}`}>
                                        <Button className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-1.5">
                                            <PlayCircle className="w-4 h-4" /> {hasStarted ? "Үргэлжлүүлэх" : "Эхлэх"}
                                        </Button>
                                    </Link>
                                ) : (
                                    <div className="bg-blue-50 px-3 py-1.5 rounded-lg flex flex-col items-end gap-0.5 min-w-[120px]">
                                        <div className="flex items-center text-blue-500 text-xs font-bold gap-1">
                                            <Clock className="w-3.5 h-3.5" /> Хүлээгдэж байна
                                        </div>
                                        {formatTimeLeft(schedule, now) && (
                                            <span className="text-[10px] text-blue-400 font-medium">
                                                Эхлэхэд: {formatTimeLeft(schedule, now)}
                                            </span>
                                        )}
                                    </div>
                                )
                            ) : registrationExpired ? (
                                <div className="w-24 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-semibold gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> Дууссан
                                </div>
                            ) : (
                                <div className="flex flex-col items-end gap-1.5">
                                    <Button
                                        onClick={(e) => { e.preventDefault(); registerMutation.mutate(exam.id); }}
                                        disabled={registerMutation.isPending}
                                        className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                                    >
                                        {registerMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Бүртгүүлэх"}
                                    </Button>
                                    {formatTimeLeft(regEnd, now) && (
                                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                            Хаагдахад: {formatTimeLeft(regEnd, now)}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-5 pb-10">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <Link href="/student" className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Миний шалгалтууд</h1>
                    <p className="text-xs text-slate-500">{profile?.class} ангид зориулсан бүх шалгалт</p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: "Нийт", value: exams.length, color: "text-slate-700", icon: ClipboardList },
                    { label: "Удахгүй болох", value: upcomingExams.length, color: "text-blue-600", icon: Clock },
                    { label: "Өгсөн", value: completedExams.length, color: "text-emerald-600", icon: CheckCircle },
                ].map((s, i) => (
                    <Card key={i} className="border-0 shadow-sm">
                        <CardContent className="p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                                <s.icon className={`w-4 h-4 ${s.color}`} />
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{s.label}</p>
                                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                    <p className="text-slate-400 text-sm font-medium">Уншиж байна...</p>
                </div>
            ) : exams.length === 0 ? (
                <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50 shadow-none">
                    <CardContent className="py-16 text-center">
                        <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-base font-bold text-slate-600">Шалгалт бүртгэгдээгүй байна</h3>
                        <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">Тун удахгүй таны ангид тохирох шалгалтууд энд харагдах болно.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-5">
                    {/* Upcoming */}
                    {upcomingExams.length > 0 && (
                        <div>
                            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                                Удахгүй болох ({upcomingExams.length})
                            </h2>
                            <div className="space-y-3">
                                {upcomingExams.map(renderExamCard)}
                            </div>
                        </div>
                    )}

                    {/* Completed */}
                    {completedExams.length > 0 && (
                        <div>
                            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                                Өгсөн шалгалтууд ({completedExams.length})
                            </h2>
                            <div className="space-y-3">
                                {completedExams.map(renderExamCard)}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
