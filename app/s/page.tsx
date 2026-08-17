"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signInWithCustomToken } from "firebase/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ArrowRight, BookOpen, Clock, Loader2, KeyRound, Phone } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { toast } from "sonner";

interface OpenExam {
    id: string;
    title: string;
    duration: number;
    startedAt: number | null;
    started: boolean;
}

interface StudentInfo {
    uid: string;
    firstName: string;
    lastName: string;
    grade: string;
}

/**
 * Сурагч нэвтрэх — админ Excel-ээс импортлохдоо өгсөн
 * УТАСНЫ ДУГААР + 3 ТЭМДЭГТ КОД-оор шалгалт руу шууд орно.
 */
export default function StudentExamEntryPage() {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2>(1);
    const [loading, setLoading] = useState(false);
    const [entering, setEntering] = useState<string | null>(null);

    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");

    const [student, setStudent] = useState<StudentInfo | null>(null);
    const [exams, setExams] = useState<OpenExam[]>([]);

    /** Session cookie тавьж, шалгалтад бүртгүүлээд шалгалтын өрөө рүү оруулна. */
    const enterExam = async (examId: string) => {
        setEntering(examId);
        try {
            const res = await fetch(`/api/exam/${examId}/register`, { method: "POST" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Шалгалтад бүртгүүлэхэд алдаа гарлаа");
            }
            router.push(`/student/exam/${examId}`);
        } catch (err) {
            console.error("[/s] enter exam failed", err);
            toast.error(err instanceof Error ? err.message : "Шалгалт руу орох боломжгүй байна");
            setEntering(null);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        const cleanPhone = phone.replace(/\D/g, "");
        const cleanCode = code.trim().toUpperCase();
        if (cleanPhone.length < 8) {
            toast.error("Утасны дугаараа бүтэн оруулна уу");
            return;
        }
        if (!cleanCode) {
            toast.error("Нэвтрэх кодоо оруулна уу");
            return;
        }

        setLoading(true);
        try {
            // 1. Утас + кодыг сервер дээр шалгаж custom token авна
            const res = await fetch("/api/auth/exam-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: cleanPhone, code: cleanCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Нэвтрэхэд алдаа гарлаа");
                return;
            }

            // 2. Firebase-д нэвтэрч, session cookie тавина
            const credential = await signInWithCustomToken(auth, data.token);
            const idToken = await credential.user.getIdToken();
            const sessionRes = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
            });
            if (!sessionRes.ok) {
                throw new Error("Сессион үүсгэхэд алдаа гарлаа");
            }

            setStudent(data.student as StudentInfo);
            const openExams = (data.exams || []) as OpenExam[];
            setExams(openExams);

            // 3. Яг одоо явагдаж буй ганц шалгалт байвал шууд оруулна
            const running = openExams.filter(x => x.started);
            if (running.length === 1) {
                toast.success(`Сайн байна уу, ${data.student.firstName}!`);
                await enterExam(running[0].id);
                return;
            }

            setStep(2);
            if (openExams.length === 0) {
                toast.error("Таны ангид одоогоор идэвхтэй шалгалт алга байна.");
            } else {
                toast.success(`Сайн байна уу, ${data.student.firstName}!`);
            }
        } catch (err) {
            console.error("[/s] login failed", err);
            toast.error(err instanceof Error ? err.message : "Холбогдоход алдаа гарлаа");
        } finally {
            setLoading(false);
        }
    };

    const backToLogin = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            await auth.signOut();
        } catch {
            /* ignore */
        }
        setStep(1);
        setExams([]);
        setStudent(null);
        setCode("");
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 py-12">
            <div className="w-full max-w-md">

                {step === 1 && (
                    <Card className="shadow-2xl border-0 overflow-hidden rounded-2xl">
                        <div className="bg-linear-to-r from-blue-600 to-indigo-600 p-8 text-center text-white relative">
                            <div className="absolute top-0 inset-x-0 h-full bg-white/5 opacity-20"></div>
                            <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center mb-4 relative z-10 shadow-lg">
                                <Logo size={46} />
                            </div>
                            <h1 className="text-3xl font-black relative z-10">Шалгалт өгөх</h1>
                            <p className="text-blue-100 font-medium mt-2 relative z-10">
                                Багшаас авсан утасны дугаар, кодоо оруулна уу.
                            </p>
                        </div>

                        <CardContent className="p-8">
                            <form onSubmit={handleLogin} className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                        <Phone className="w-4 h-4 text-slate-400" /> Утасны дугаар
                                    </label>
                                    <Input
                                        required
                                        type="tel"
                                        inputMode="numeric"
                                        autoComplete="tel"
                                        placeholder="99112233"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value.replace(/[^\d\s+-]/g, ""))}
                                        className="h-12 bg-slate-50 border-slate-200 focus:bg-white text-lg tracking-wide"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                        <KeyRound className="w-4 h-4 text-slate-400" /> Нэвтрэх код
                                    </label>
                                    <Input
                                        required
                                        placeholder="A7K"
                                        value={code}
                                        onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                                        className="h-12 bg-slate-50 border-slate-200 focus:bg-white text-2xl font-black tracking-[0.4em] text-center uppercase"
                                    />
                                    <p className="text-xs text-slate-500">
                                        Код нь том үсэг, тооноос бүрдсэн 3 тэмдэгт (жишээ: A7K).
                                    </p>
                                </div>

                                <div className="pt-2">
                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl shadow-lg mt-4"
                                    >
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Шалгалт өгөх"}
                                    </Button>
                                    <div className="pt-6 text-center">
                                        <button
                                            type="button"
                                            onClick={() => router.push("/")}
                                            className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
                                        >
                                            Буцах
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-black text-slate-800">Шалгалтууд</h2>
                            <p className="text-slate-500 font-medium">
                                {student ? `Чамд амжилт хүсье, ${student.firstName}!` : ""}
                            </p>
                        </div>

                        {exams.length === 0 ? (
                            <Card className="border-dashed border-2 border-slate-200 shadow-none bg-transparent">
                                <CardContent className="p-8 text-center flex flex-col items-center">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                        <BookOpen className="w-8 h-8 text-slate-400" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 mb-1">Идэвхтэй шалгалт олдсонгүй</h3>
                                    <p className="text-sm text-slate-500 mb-6">
                                        {student?.grade ? `${student.grade}-р ангид` : "Таны ангид"} одоогоор
                                        шалгалт зарлагдаагүй эсвэл хугацаа нь дууссан байна.
                                    </p>
                                    <Button variant="outline" onClick={backToLogin}>Буцах</Button>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                {exams.map(exam => (
                                    <Card key={exam.id} className="border border-slate-200 shadow-md hover:border-blue-300 hover:shadow-lg transition-all rounded-xl overflow-hidden">
                                        <CardContent className="p-6">
                                            <h3 className="font-bold text-lg text-slate-800 mb-2">{exam.title}</h3>
                                            <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-500 mb-5">
                                                <span className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
                                                    <Clock className="w-4 h-4" /> {exam.duration} мин
                                                </span>
                                                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold ${exam.started ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                                                    {exam.started ? "Явагдаж байна" : "Нээлттэй"}
                                                </span>
                                            </div>
                                            <Button
                                                onClick={() => enterExam(exam.id)}
                                                disabled={entering !== null}
                                                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 font-bold text-base gap-2 rounded-xl text-white"
                                            >
                                                {entering === exam.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                                    <>Орох <ArrowRight className="w-4 h-4" /></>
                                                )}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}

                                <div className="pt-4 text-center">
                                    <button
                                        onClick={backToLogin}
                                        className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
                                    >
                                        Гарах
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
