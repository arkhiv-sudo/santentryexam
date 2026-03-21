"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ArrowLeft, UserPlus, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

export default function AddChildPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        lastName: "",
        firstName: "",
        nationalId: "",
        phone: "",
        school: "",
        className: "",
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("Authentication error");

            const res = await fetch("/api/parent/children", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(formData),
            });

            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || "Алдаа гарлаа");
            }

            toast.success("Хүүхэд амжилттай нэмэгдлээ!");
            router.push("/parent");
        } catch (error: any) {
            toast.error(error.message);
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-16">
            <div className="flex items-center gap-4">
                <Link href="/parent">
                    <Button variant="ghost" size="sm" className="gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        Буцах
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Шинэ хүүхэд нэмэх</h1>
            </div>

            <Card className="shadow-lg border-slate-200">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-6">
                    <CardTitle className="flex items-center gap-3 text-xl text-slate-800">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <UserPlus className="w-5 h-5" />
                        </div>
                        Хүүхдийн мэдээлэл
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Овог <span className="text-red-500">*</span></label>
                                <Input
                                    name="lastName"
                                    placeholder="Хүүхдийн овог"
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    required
                                    className="h-12 border-slate-200"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Нэр <span className="text-red-500">*</span></label>
                                <Input
                                    name="firstName"
                                    placeholder="Хүүхдийн нэр"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    required
                                    className="h-12 border-slate-200"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">Регистрийн дугаар (РД) <span className="text-red-500">*</span></label>
                            <Input
                                name="nationalId"
                                placeholder="ЖЖ00112233"
                                value={formData.nationalId}
                                onChange={handleChange}
                                required
                                className="h-12 border-slate-200 uppercase"
                            />
                            <p className="text-xs text-slate-500 ml-1">Зөвхөн нэг бүртгэх боломжтой, давхардахгүй</p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Утасны дугаар (заавал биш)</label>
                                <Input
                                    name="phone"
                                    type="tel"
                                    placeholder="Утасны дугаар"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="h-12 border-slate-200"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Сургууль</label>
                                <Input
                                    name="school"
                                    placeholder="Сургуулийн нэр"
                                    value={formData.school}
                                    onChange={handleChange}
                                    className="h-12 border-slate-200"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">Анги</label>
                            <Input
                                name="className"
                                placeholder="Жишээ: 12А"
                                value={formData.className}
                                onChange={handleChange}
                                className="h-12 border-slate-200"
                            />
                        </div>

                        <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-sm border border-amber-200 italic">
                            Жич: Мэдээллээ хадгалсны дараа таны хүүхдийн <strong>нэвтрэх код ба нууц үг</strong> автоматаар үүсэх ба эдгээрийг хянах самбараас харах боломжтой.
                        </div>

                        <div className="pt-4 flex justify-end gap-3">
                            <Link href="/parent">
                                <Button type="button" variant="outline" className="h-12" disabled={loading}>
                                    Цуцлах
                                </Button>
                            </Link>
                            <Button type="submit" className="h-12 bg-blue-600 hover:bg-blue-700 text-white min-w-[150px]" disabled={loading}>
                                {loading ? (
                                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Уншиж байна...</>
                                ) : (
                                    <><UserPlus className="w-5 h-5 mr-2" /> Бүртгэх</>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
