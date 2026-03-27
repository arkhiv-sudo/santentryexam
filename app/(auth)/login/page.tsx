"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { toast } from "sonner";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const processLogin = async (user: { uid: string; getIdToken: () => Promise<string> }) => {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            let role = "student";
            if (userDoc.exists()) {
                role = userDoc.data().role;
            }

            const idToken = await user.getIdToken();
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
            });

            if (!res.ok) {
                throw new Error("network_error");
            }

            if (role === "admin") router.push("/admin");
            else if (role === "teacher") router.push("/teacher");
            else if (role === "parent") router.push("/parent");
            else router.push("/student");
        } catch (error) {
            throw error; // Let the caller handle it
        }
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            let loginEmail = email.trim();
            // Student code login: no @ → append @student.internal
            if (!loginEmail.includes("@")) {
                loginEmail = `${loginEmail.toUpperCase()}@student.internal`;
            }

            const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
            await processLogin(userCredential.user);
            toast.success("Амжилттай нэвтэрлээ!");
        } catch (e: unknown) {
            const err = e as { code?: string; message?: string };
            let message = "Имэйл/Код эсвэл нууц үг буруу байна";
            
            if (err?.code === "auth/network-request-failed" || err?.message === "network_error") {
                message = "Интернэт холболт тасарсан эсвэл сервертэй холбогдож чадсангүй.";
            } else if (err?.code === "auth/too-many-requests") {
                message = "Хэт олон удаа буруу оролдлоо. Түр хүлээгээд дахин оролдоно уу.";
            } else if (err?.code === "auth/invalid-credential") {
                 message = "Нэвтрэх мэдээлэл буруу байна.";
            }

            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto">
            <Card className="w-full shadow-lg border-slate-200 bg-white overflow-hidden transition-all hover:shadow-xl">
                <CardHeader className="space-y-1 text-center bg-slate-50/50 border-b border-slate-100 py-6">
                <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">Тавтай морилно уу</CardTitle>
                <CardDescription className="text-slate-500 text-sm">
                    Өөрийн мэдээллээ оруулж нэвтэрнэ үү
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 p-6">
                <form onSubmit={handleEmailLogin} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold leading-none text-slate-700 ml-1">
                            Имэйл эсвэл Сурагчийн код
                        </label>
                        <Input
                            type="text"
                            placeholder="name@example.com эсвэл сурагчийн код"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="h-11 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-lg text-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1">
                            <label className="text-sm font-semibold leading-none text-slate-700">Нууц үг</label>
                            <Link href="/forgot-password" className="text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors">
                                Нууц үгээ мартсан уу?
                            </Link>
                        </div>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="h-11 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-lg text-sm"
                        />
                    </div>
                    {error && (
                        <div className="text-sm text-red-500 font-medium bg-red-50 p-3 rounded-lg border border-red-100 italic">
                            {error}
                        </div>
                    )}
                    <Button
                        type="submit"
                        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base rounded-lg transition-all"
                        disabled={loading}
                    >
                        {loading ? "Нэвтэрч байна..." : "Нэвтрэх"}
                    </Button>
                </form>
            </CardContent>
            <div className="p-8 pt-0 text-center text-sm text-slate-500 bg-slate-50/30 border-t border-slate-50">
                Бүртгэлгүй юу?{" "}
                <Link href="/signup" className="font-bold text-blue-600 underline underline-offset-4 hover:text-blue-700 transition-colors">
                    Бүртгүүлэх
                </Link>
            </div>
        </Card>
        </div>
    );
}
