"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft, Send } from "lucide-react";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const router = useRouter();

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const loginEmail = email.trim();
            
            if (!loginEmail) {
                toast.error("Имэйл хаягаа оруулна уу.");
                setLoading(false);
                return;
            }

            // Custom URL might cause 'auth/unauthorized-continue-uri' if not whitelisted in Firebase Console
            await sendPasswordResetEmail(auth, loginEmail);

            setSuccess(true);
            toast.success("Таны имэйл хаяг руу нууц үг сэргээх холбоос илгээгдлээ. (Spam фолдероо шалгахаа мартуузай)");
        } catch (error: unknown) {
            const err = error as { code?: string, message?: string };
            console.error("Password reset error:", error);
            if (err?.code === 'auth/user-not-found') {
                toast.error("Ийм имэйл хаягтай хэрэглэгч олдсонгүй.");
            } else if (err?.code === 'auth/invalid-email') {
                toast.error("Имэйл хаяг буруу байна.");
            } else if (err?.code === 'auth/unauthorized-continue-uri') {
                toast.error("Домэйн тохируулга буруу байна.");
            } else {
                toast.error("Илгээхэд алдаа гарлаа: " + (err?.message || "Тодорхойгүй алдаа"));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-50">
            {/* Background Decorations */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[100px] -mr-40 -mt-40 mix-blend-multiply" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] -ml-40 -mb-40 mix-blend-multiply" />

            <div className="max-w-md w-full relative z-10">
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block transition-transform hover:scale-105">
                        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-200">
                            <span className="text-white font-black text-2xl tracking-tighter">S</span>
                        </div>
                    </Link>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Нууц үг сэргээх</h2>
                    <p className="text-slate-500 font-medium text-sm mt-2">
                        Бүртгэлтэй имэйлээ оруулж шинэ нууц үг хүлээн авна уу
                    </p>
                </div>

                <Card className="rounded-3xl border-0 shadow-2xl bg-white/80 backdrop-blur-xl">
                    <CardHeader className="p-6 pb-0 space-y-1 text-center">
                        <CardTitle className="text-xl font-black">Холбоос авах</CardTitle>
                        <CardDescription className="text-sm font-medium text-slate-500">
                            Танд нууц үг солих аюулгүй холбоос очих болно
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-6">
                        {success ? (
                            <div className="text-center space-y-5">
                                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                                    <Send className="w-8 h-8" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="font-black text-lg text-slate-800">Илгээгдлээ!</h3>
                                    <p className="text-sm text-slate-500 font-medium">
                                        Бид таны <b className="text-slate-800">{email}</b> хаяг руу нууц үг сэргээх заавар илгээлээ. Спам (Spam) дотроо шалгаарай.
                                    </p>
                                </div>
                                <Button
                                    onClick={() => router.push("/login")}
                                    className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-lg text-base mt-2"
                                >
                                    Нэвтрэх хэсэг рүү буцах
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleResetPassword} className="space-y-5">
                                <div className="space-y-2 relative">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                    <Input
                                        type="email"
                                        placeholder="Имэйл хаяг..."
                                        className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-lg focus-visible:ring-blue-500 text-sm font-medium"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-black text-base rounded-lg shadow-md shadow-blue-200 transition-all hover:-translate-y-0.5"
                                    disabled={loading || !email}
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        "Шинэчлэх холбоос илгээх"
                                    )}
                                </Button>

                                <div className="text-center mt-6">
                                    <Link href="/login" className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Нэвтрэх хэсэг рүү буцах
                                    </Link>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
