"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { UserProfile } from "@/types";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
    firstName: z.string().min(1, "Нэрээ оруулна уу"),
    lastName: z.string().min(1, "Овгоо оруулна уу"),
    phone: z.string().min(8, "Утасны дугаараа зөв оруулна уу"),
    emergencyPhone: z.string().min(8, "Утасны дугаараа зөв оруулна уу"),
    email: z.string().email("Имэйл хаяг буруу байна"),
    password: z.string().min(6, "Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой"),
    confirmPassword: z.string().min(6, "Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой"),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Нууц үг таарахгүй байна",
    path: ["confirmPassword"],
});

type FormData = z.infer<typeof formSchema>;

export default function SignupPage() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const {
        register,
        handleSubmit,
        formState: { errors },
        setError,
    } = useForm<FormData>({
        resolver: zodResolver(formSchema),
    });

    const onSubmit = async (data: FormData) => {
        setLoading(true);

        try {
            const finalEmail = data.email.trim();
            const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, data.password.trim());
            const user = userCredential.user;

            const profile: UserProfile = {
                uid: user.uid,
                email: finalEmail,
                firstName: data.firstName.trim(),
                lastName: data.lastName.trim(),
                role: "parent",
                phone: data.phone.trim(),
                emergencyPhone: data.emergencyPhone.trim(),
                children: [],
                // @ts-expect-error - serverTimestamp returns FieldValue but we store it as Timestamp
                createdAt: serverTimestamp(),
            };

            await setDoc(doc(db, "users", user.uid), profile);

            toast.success("Бүртгэл амжилттай үүслээ!");
            router.push("/parent");
        } catch (err: unknown) {
            const errorObj = err as { code?: string; message?: string };
            let msg = "Бүртгэл үүсгэхэд алдаа гарлаа.";
            if (errorObj.code === 'auth/weak-password') {
                msg = "Нууц үг хэтэрхий богино байна (6-аас дээш тэмдэгт оруулна уу).";
                setError("password", { message: msg });
            } else if (errorObj.code === 'auth/email-already-in-use') {
                msg = "Энэ имэйл хаяг аль хэдийн бүртгэгдсэн байна.";
                setError("email", { message: msg });
            } else {
                msg = errorObj.message || msg;
                toast.error(msg);
            }
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex justify-center py-10 px-4">
            <Card className="w-full max-w-2xl shadow-xl border-slate-200 bg-white overflow-hidden rounded-2xl">
                <CardHeader className="space-y-1 text-center bg-slate-50/50 border-b border-slate-100 py-6">
                    <div className="w-12 h-12 bg-blue-100/50 rounded-full flex items-center justify-center mx-auto mb-2">
                        <ShieldCheck className="w-6 h-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">Асран хамгаалагч бүртгүүлэх</CardTitle>
                    <CardDescription className="text-slate-500 text-sm">
                        Хүүхдийнхээ шалгалтын мэдээллийг хянахын тулд бүртгэл үүсгэнэ үү
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-8">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        {/* Овог, Нэр */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 ml-1">Овог</label>
                                <Input
                                    type="text"
                                    placeholder="Овгоо оруулна уу"
                                    {...register("lastName")}
                                    className={`h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl text-sm ${errors.lastName ? "border-red-500" : ""}`}
                                />
                                {errors.lastName && <p className="text-xs text-red-500 ml-1 font-medium">{errors.lastName.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 ml-1">Нэр</label>
                                <Input
                                    type="text"
                                    placeholder="Өөрийн нэрээ оруулна уу"
                                    {...register("firstName")}
                                    className={`h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl text-sm ${errors.firstName ? "border-red-500" : ""}`}
                                />
                                {errors.firstName && <p className="text-xs text-red-500 ml-1 font-medium">{errors.firstName.message}</p>}
                            </div>
                        </div>

                        {/* Утас, Яаралтай утас */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 ml-1">Утасны дугаар</label>
                                <Input
                                    type="tel"
                                    placeholder="9911XXXX"
                                    {...register("phone")}
                                    className={`h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl text-sm ${errors.phone ? "border-red-500" : ""}`}
                                />
                                {errors.phone && <p className="text-xs text-red-500 ml-1 font-medium">{errors.phone.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 ml-1">Яаралтай холбогдох утас</label>
                                <Input
                                    type="tel"
                                    placeholder="8811XXXX"
                                    {...register("emergencyPhone")}
                                    className={`h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl text-sm ${errors.emergencyPhone ? "border-red-500" : ""}`}
                                />
                                {errors.emergencyPhone && <p className="text-xs text-red-500 ml-1 font-medium">{errors.emergencyPhone.message}</p>}
                            </div>
                        </div>

                        {/* Имэйл */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700 ml-1">Имэйл хаяг</label>
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                {...register("email")}
                                className={`h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl text-sm ${errors.email ? "border-red-500" : ""}`}
                            />
                            {errors.email && <p className="text-xs text-red-500 ml-1 font-medium">{errors.email.message}</p>}
                        </div>

                        {/* Нууц үг, Давтах */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 ml-1">Нууц үг</label>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    {...register("password")}
                                    className={`h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl text-sm ${errors.password ? "border-red-500" : ""}`}
                                />
                                {errors.password && <p className="text-xs text-red-500 ml-1 font-medium">{errors.password.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700 ml-1">Нууц үгээ давтах</label>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    {...register("confirmPassword")}
                                    className={`h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl text-sm ${errors.confirmPassword ? "border-red-500" : ""}`}
                                />
                                {errors.confirmPassword && <p className="text-xs text-red-500 ml-1 font-medium">{errors.confirmPassword.message}</p>}
                            </div>
                        </div>

                        <Button type="submit" className="w-full h-12 mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-all shadow-md active:scale-[0.98] rounded-xl" disabled={loading}>
                            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Бүртгэл үүсгэх"}
                        </Button>

                        <div className="text-center text-sm text-slate-500 font-medium pt-3">
                            Бүртгэлтэй юу?{" "}
                            <Link href="/login" className="font-bold text-blue-600 hover:text-blue-700 transition-colors">
                                Нэвтрэх
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
