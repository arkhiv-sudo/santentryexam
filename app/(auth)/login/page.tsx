"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { toast } from "sonner";
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile } from "@/types";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const processLogin = async (user: any) => {
        // 1. Check if user document exists
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let role = 'student';

        if (!userDoc.exists()) {
            // New user (likely via Google)
            role = 'parent';
            const profile: UserProfile = {
                uid: user.uid,
                email: user.email!,
                firstName: user.displayName?.split(' ').pop() || '',
                lastName: user.displayName?.split(' ').slice(0, -1).join(' ') || '',
                role: 'parent',
                // @ts-ignore
                createdAt: serverTimestamp(),
            };

            // Auto-link to any students already using this email as parentEmail
            const studentQuery = query(collection(db, "users"), where("parentEmail", "==", user.email), where("role", "==", "student"));
            const studentSnapshot = await getDocs(studentQuery);
            const childrenIds = studentSnapshot.docs.map(d => d.id);
            profile.children = childrenIds;

            await setDoc(doc(db, "users", user.uid), profile);
            toast.info("Шинэ бүртгэл үүслээ (Эцэг эх).");
        } else {
            role = userDoc.data().role;
        }

        // 2. Get ID Token
        const idToken = await user.getIdToken();

        // 3. Create Server Session
        await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });

        // 4. Redirect
        if (role === 'admin') router.push('/admin');
        else if (role === 'teacher') router.push('/teacher');
        else if (role === 'parent') router.push('/parent');
        else router.push('/student');
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            let loginEmail = email;
            // If it's a student code (6 chars, no @)
            if (!email.includes("@")) {
                loginEmail = `${email.toUpperCase().trim()}@student.internal`;
            }

            const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
            await processLogin(userCredential.user);
            toast.success("Амжилттай нэвтэрлээ!");
        } catch (err: any) {
            const message = "Имэйл/Код эсвэл нууц үг буруу байна";
            setError(message);
            toast.error(message);
            console.error(err);
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError("");
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            await processLogin(result.user);
            toast.success("Google-ээр амжилттай нэвтэрлээ!");
        } catch (err: any) {
            console.error(err);
            toast.error("Google-ээр нэвтрэхэд алдаа гарлаа.");
            setError("Google-ээр нэвтрэхэд алдаа гарлаа.");
            setLoading(false);
        }
    };

    return (
        <Card className="w-full shadow-lg border-slate-200 bg-white overflow-hidden transition-all hover:shadow-xl">
            <CardHeader className="space-y-1 text-center bg-slate-50/50 border-b border-slate-100 py-8">
                <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">Тавтай морилно уу</CardTitle>
                <CardDescription className="text-slate-500 text-base">
                    Өөрийн мэдээллээ оруулж нэвтэрнэ үү
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 p-8">
                <Button
                    variant="outline"
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full py-6 text-base font-medium transition-all hover:bg-slate-50 border-slate-200 flex items-center justify-center gap-3"
                >
                    <svg className="h-5 w-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                        <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                    </svg>
                    Google-ээр үргэлжлүүлэх
                </Button>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-100" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-4 text-slate-400 font-medium">Эсвэл имэйлээр нэвтрэх</span>
                    </div>
                </div>

                <form onSubmit={handleEmailLogin} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold leading-none text-slate-700 ml-1">Имэйл эсвэл Сурагчийн код</label>
                        <Input
                            type="text"
                            placeholder="name@example.com эсвэл 6 оронтой код"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-lg"
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold leading-none text-slate-700 ml-1">Нууц үг</label>
                        </div>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-lg"
                        />
                    </div>
                    {error && (
                        <div className="text-sm text-red-500 font-medium bg-red-50 p-3 rounded-lg border border-red-100 italic">
                            {error}
                        </div>
                    )}
                    <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg transition-all shadow-md active:scale-[0.98] rounded-xl mt-2" disabled={loading}>
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
    );
}
