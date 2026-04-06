"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { signInWithCustomToken } from "firebase/auth";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GraduationCap, ArrowRight, BookOpen, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ExamService } from "@/lib/services/exam-service";
import { Exam } from "@/types";

export default function StudentNoLoginPortal() {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2>(1);
    const [loading, setLoading] = useState(false);
    
    // User Form State
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [grade, setGrade] = useState("12");

    // Exams
    const [exams, setExams] = useState<Exam[]>([]);

    const handleSearchExams = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!firstName.trim() || !lastName.trim()) {
            toast.error("Овог болон Нэрээ оруулна уу.");
            return;
        }

        setLoading(true);
        try {
            // 1. Fetch custom token from our backend (bypasses Anonymous Auth requirement)
            const tokenRes = await fetch("/api/auth/anonymous", { method: "POST" });
            const tokenData = await tokenRes.json();
            
            if (!tokenRes.ok) {
                toast.error(tokenData.error || "Нэвтрэлтийн холболт үүсгэхэд алдаа гарлаа.");
                setLoading(false);
                return;
            }

            // 2. Sign in using the generated custom token
            const userCredential = await signInWithCustomToken(auth, tokenData.token);
            const user = userCredential.user;

            // 3. Refresh token so our backend API routes recognize the user
            // Call the login route implicitly used by AuthProvider to set the session cookie
            const idToken = await user.getIdToken();
            try {
                await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ idToken }),
                });
            } catch (e) {
                console.warn("Session cookie fetch error", e);
            }

            // 3. Create or update user Document (Safe because rules allow self-update and anonymous has uid)
            await setDoc(doc(db, "users", user.uid), {
                role: "student",
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                class: `${grade}-р анги`,
                grade: grade, // store grade explicitly
                school: "Онлайн шалгалт",
                isAnonymous: true,
                createdAt: new Date()
            }, { merge: true });

            // 4. Fetch available published exams for this grade
            const q = query(
                collection(db, "exams"),
                where("status", "==", "published"),
                where("grade", "==", grade)
            );
            const snapshot = await getDocs(q);
            
            const fetchedExams = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    scheduledAt: data.scheduledAt?.toDate ? data.scheduledAt.toDate() : new Date(data.scheduledAt),
                    registrationEndDate: data.registrationEndDate?.toDate ? data.registrationEndDate.toDate() : new Date(data.registrationEndDate)
                } as Exam;
            });

            // Filter out exams where time has fully passed
            const now = new Date();
            const activeExams = fetchedExams.filter(exam => {
                const examEndTime = new Date(exam.scheduledAt.getTime() + (exam.duration * 60000));
                return now < examEndTime; // Only show exams that haven't fully ended
            });

            setExams(activeExams);
            setStep(2);
            
            if (activeExams.length === 0) {
                toast.error("Энэ ангид одоо идэвхтэй байгаа шалгалт алга байна.");
            } else {
                toast.success("Та амжилттай нэвтэрлээ. Шалгалтаа сонгоно уу.");
            }

        } catch (error) {
            console.error("Exam entry error:", error);
            toast.error("Холбогдоход алдаа гарлаа. Та интернэтээ шалгана уу.");
        } finally {
            setLoading(false);
        }
    };

    const handleStartExam = async (exam: Exam) => {
        if (!auth.currentUser) return;
        setLoading(true);
        try {
            // Register student strictly to the exam first
            await ExamService.registerForExam(auth.currentUser.uid, exam.id);
            // Redirect straight to exam room
            router.push(`/student/exam/${exam.id}`);
        } catch (error) {
            console.error("Registration failed:", error);
            toast.error("Шалгалтанд бүртгүүлэхэд алдаа гарлаа.");
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 py-12">
            <div className="w-full max-w-md">
                
                {step === 1 && (
                    <Card className="shadow-2xl border-0 overflow-hidden rounded-2xl">
                        <div className="bg-linear-to-r from-blue-600 to-indigo-600 p-8 text-center text-white relative">
                            <div className="absolute top-0 inset-x-0 h-full bg-white/5 opacity-20"></div>
                            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl mx-auto flex items-center justify-center mb-4 relative z-10 shadow-lg">
                                <GraduationCap className="w-8 h-8 text-white" />
                            </div>
                            <h1 className="text-3xl font-black relative z-10">Сурагч нэвтрэх</h1>
                            <p className="text-blue-100 font-medium mt-2 relative z-10">Бүртгэлгүйгээр мэдээллээ оруулаад шууд шалгалтаа өгөөрэй.</p>
                        </div>
                        
                        <CardContent className="p-8">
                            <form onSubmit={handleSearchExams} className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">Овог</label>
                                    <Input 
                                        required 
                                        placeholder="Овог" 
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        className="h-12 bg-slate-50 border-slate-200 focus:bg-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">Нэр</label>
                                    <Input 
                                        required 
                                        placeholder="Өөрийн нэр" 
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        className="h-12 bg-slate-50 border-slate-200 focus:bg-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">Анги</label>
                                    <select 
                                        value={grade}
                                        onChange={(e) => setGrade(e.target.value)}
                                        className="flex h-12 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                                    >
                                        {[6, 7, 8, 9, 10, 11, 12].map(g => (
                                            <option key={g} value={g.toString()}>{g}-р анги</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="pt-2">
                                    <Button 
                                        type="submit" 
                                        disabled={loading}
                                        className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl shadow-lg mt-6"
                                    >
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Үргэлжлүүлэх"}
                                    </Button>
                                    <div className="pt-6 text-center">
                                        <button 
                                            type="button"
                                            onClick={() => router.push('/')}
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
                            <p className="text-slate-500 font-medium">Чамд амжилт хүсье, {firstName}!</p>
                        </div>

                        {exams.length === 0 ? (
                            <Card className="border-dashed border-2 border-slate-200 shadow-none bg-transparent">
                                <CardContent className="p-8 text-center flex flex-col items-center">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                        <BookOpen className="w-8 h-8 text-slate-400" />
                                    </div>
                                    <h3 className="font-bold text-slate-700 mb-1">Идэвхтэй шалгалт олдсонгүй</h3>
                                    <p className="text-sm text-slate-500 mb-6">Таны сонгосон ангид одоогоор шалгалт зарлагдаагүй эсвэл хугацаа нь дууссан байна.</p>
                                    <Button variant="outline" onClick={() => { setStep(1); auth.signOut(); }}>
                                        Буцах
                                    </Button>
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
                                                    <BookOpen className="w-4 h-4" /> {exam.grade}-р анги
                                                </span>
                                                <span className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
                                                    <Clock className="w-4 h-4" /> {exam.duration} мин
                                                </span>
                                            </div>
                                            <Button 
                                                onClick={() => handleStartExam(exam)}
                                                disabled={loading}
                                                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 font-bold text-base gap-2 rounded-xl"
                                            >
                                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                                    <>Шалгалт эхлэх <ArrowRight className="w-4 h-4" /></>
                                                )}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                                
                                <div className="pt-4 text-center">
                                    <button 
                                        onClick={() => { setStep(1); auth.signOut(); }}
                                        className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
                                    >
                                        Мэдээлэл засах (Буцах)
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
