"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
    Settings, Database, Bell, Shield, Mail, Globe,
    HardDrive, Cpu, Users, FileQuestion, ClipboardList, BookOpen,
    CircleDot
} from "lucide-react";
import { toast } from "sonner";
import { db, functions } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const STATS_CACHE_KEY = "admin_stats_cache";

export default function SettingsPage() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [isLive, setIsLive] = useState(false);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usage, setUsage] = useState<{
        reads: number,
        writes: number,
        deletes: number,
        firestoreSize?: number,
        storageSize?: number,
        history?: any[]
    } | null>(null);

    // Stats state with local cache
    const [stats, setStats] = useState(() => {
        const defaults = {
            totalUsers: 0,
            totalQuestions: 0,
            totalExams: 0,
            totalSubjects: 0,
            totalSubmissions: 0,
            totalImages: 0
        };

        if (typeof window !== 'undefined') {
            const cached = localStorage.getItem(STATS_CACHE_KEY);
            return cached ? { ...defaults, ...JSON.parse(cached) } : defaults;
        }
        return defaults;
    });

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    useEffect(() => {
        if (profile?.role !== "admin") return;

        const docRef = doc(db, "system", "stats");
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const newStats = {
                    totalUsers: data.totalUsers || 0,
                    totalQuestions: data.totalQuestions || 0,
                    totalExams: data.totalExams || 0,
                    totalSubjects: data.totalSubjects || 0,
                    totalSubmissions: data.totalSubmissions || 0,
                    totalImages: data.totalImages || 0
                };
                setStats(newStats);
                localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(newStats));
                setIsLive(true);
            }
        }, (error) => {
            console.error("Stats snapshot error:", error);
            setIsLive(false);
        });

        return () => unsubscribe();
    }, [profile]);

    useEffect(() => {
        if (profile?.role !== "admin") return;

        const fetchUsage = async () => {
            setUsageLoading(true);
            try {
                const getUsageFn = httpsCallable(functions, 'getInfrastructureUsage');
                const result = await getUsageFn();
                const data = result.data as any;
                if (data.success) {
                    setUsage(data.usage);
                }
            } catch (error) {
                console.error("Failed to fetch usage metrics:", error);
            } finally {
                setUsageLoading(false);
            }
        };

        fetchUsage();
        // Refresh every 5 minutes to keep it fresh but avoid over-calling
        const interval = setInterval(fetchUsage, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [profile]);

    if (authLoading) return <div className="p-8 text-center text-slate-500">Уншиж байна...</div>;

    const handleSave = async () => {
        setSaving(true);
        // Simulation of save
        setTimeout(() => {
            setSaving(false);
            toast.success("Тохиргоо хадгалагдлаа");
        }, 1000);
    };

    return (
        <div className="space-y-6">
            {/* Simple Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Settings className="w-6 h-6" />
                        Системийн тохиргоо
                    </h1>
                    <p className="text-sm text-slate-500">Системийн хэрэглээ болон үндсэн тохиргоог удирдах</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="default"
                        className="gap-2"
                        onClick={async () => {
                            try {
                                const recalculateFn = httpsCallable(functions, 'recalculateStats');
                                toast.promise(recalculateFn(), {
                                    loading: 'Тооцоолж байна...',
                                    success: 'Амжилттай шинэчлэгдлээ',
                                    error: 'Алдаа гарлаа'
                                });
                            } catch (e) {
                                console.error(e);
                            }
                        }}
                    >
                        <Cpu className="w-4 h-4" />
                        Дахин тооцоолох
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                    >
                        {saving ? "Хадгалж байна..." : "Хадгалах"}
                    </Button>
                </div>
            </div>

            <div className="space-y-6">
                {/* Database Usage - Real-time Data Focus */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-bold">Өгөгдлийн сангийн хэрэглээ</CardTitle>
                            <CardDescription className="text-xs">
                                Бодит цагийн өгөгдлийн тоо хэмжээ
                            </CardDescription>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors ${isLive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <CircleDot className={`w-3 h-3 ${isLive ? 'animate-pulse' : ''}`} />
                            {isLive ? 'Бодит цагт холбогдсон' : 'Холболт тасарсан'}
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                            {[
                                { label: "Хэрэглэгчид", value: stats.totalUsers, icon: <Users className="w-5 h-5 text-blue-500" /> },
                                { label: "Асуултууд", value: stats.totalQuestions, icon: <FileQuestion className="w-5 h-5 text-orange-500" /> },
                                { label: "Шалгалтууд", value: stats.totalExams, icon: <ClipboardList className="w-5 h-5 text-purple-500" /> },
                                { label: "Мэргэжил/Сэдэв", value: stats.totalSubjects, icon: <BookOpen className="w-5 h-5 text-emerald-500" /> },
                                { label: "Илгээсэн материал", value: stats.totalSubmissions, icon: <Mail className="w-5 h-5 text-pink-500" /> },
                                { label: "Давхардаагүй зураг", value: stats.totalImages, icon: <HardDrive className="w-5 h-5 text-slate-500" /> },
                            ].map((item, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex items-center gap-2 text-slate-500">
                                        {item.icon}
                                        <span className="text-xs font-semibold">{item.label}</span>
                                    </div>
                                    <p className="text-3xl font-bold tracking-tight text-slate-900 border-l-2 border-slate-100 pl-3">
                                        {(item.value || 0).toLocaleString()}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Actual Operations Info */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="flex items-center gap-2 mb-4">
                                    <Cpu className="w-4 h-4 text-indigo-600" />
                                    <p className="text-sm font-bold text-slate-900">Өдрийн үнэгүй квот (Daily Free Tier)</p>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        { label: "Уншилт (Reads)", value: usage?.reads, limit: 50000, color: "bg-blue-600" },
                                        { label: "Бичилт (Writes)", value: usage?.writes, limit: 20000, color: "bg-emerald-600" },
                                        { label: "Устгалт (Deletes)", value: usage?.deletes, limit: 20000, color: "bg-red-500" },
                                    ].map((op, i) => {
                                        const percent = Math.min(((op.value || 0) / op.limit) * 100, 100);
                                        return (
                                            <div key={i} className="space-y-1.5">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500 font-medium">{op.label}</span>
                                                    <span className="font-bold text-slate-900">
                                                        {usageLoading ? "..." : (op.value || 0).toLocaleString()} / {(op.limit / 1000)}k
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 ${op.color}`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between items-center text-[10px]">
                                                    <span className="text-slate-400 font-medium">Free Tier progress</span>
                                                    <span className={percent > 90 ? "text-red-500 font-bold" : "text-slate-500"}>
                                                        {percent.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-4 text-[10px] text-slate-400 leading-relaxed">
                                    * Өнөөдрийн 00:00-оос хойшхи бодит хэрэглээг Google Cloud-аас харуулж байна.
                                </p>
                            </div>

                            {/* 7-Day History Info */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="flex items-center gap-2 mb-4">
                                    <BookOpen className="w-4 h-4 text-indigo-600" />
                                    <p className="text-sm font-bold text-slate-900">Сүүлийн 7 хоногийн түүх</p>
                                </div>
                                <div className="space-y-2 overflow-y-auto max-h-[220px] pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                                    {usage?.history?.slice().reverse().map((day: any, i: number) => (
                                        <div key={i} className={`p-2 rounded-lg border ${day.isToday ? 'bg-white border-indigo-100 shadow-sm' : 'bg-transparent border-transparent'}`}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className={`text-[10px] font-bold uppercase ${day.isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                                                    {day.isToday ? 'Өнөөдөр' : day.date}
                                                </span>
                                                {day.isToday && <span className="text-[9px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full font-bold">LIVE</span>}
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                                                <div className="flex flex-col">
                                                    <span className="text-slate-400">Read</span>
                                                    <span className="font-bold text-slate-700">{day.reads.toLocaleString()}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-slate-400">Write</span>
                                                    <span className="font-bold text-slate-700">{day.writes.toLocaleString()}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-slate-400">Delete</span>
                                                    <span className="font-bold text-slate-700">{day.deletes.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {!usage?.history && <p className="text-center text-xs text-slate-400 py-4">Түүх ачаалж байна...</p>}
                                </div>
                                <p className="mt-4 text-[9px] text-slate-400 italic">
                                    * Өдөр бүрийн нийт ажиллагааны статистик.
                                </p>
                            </div>

                            {/* Storage Capacity Info */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="flex items-center gap-2 mb-4">
                                    <HardDrive className="w-4 h-4 text-indigo-600" />
                                    <p className="text-sm font-bold text-slate-900">Хадгалах сангийн багтаамж</p>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        {
                                            label: "Firestore Database",
                                            value: usage?.firestoreSize || 0,
                                            limit: 1024 * 1024 * 1024, // 1 GB
                                            limitLabel: "1 GB",
                                            color: "bg-blue-600"
                                        },
                                        {
                                            label: "Cloud Storage (Зураг)",
                                            value: usage?.storageSize || 0,
                                            limit: 5 * 1024 * 1024 * 1024, // 5 GB
                                            limitLabel: "5 GB",
                                            color: "bg-orange-600"
                                        },
                                    ].map((op, i) => {
                                        const mbValue = (op.value / (1024 * 1024)).toFixed(1);
                                        const percent = Math.min((op.value / op.limit) * 100, 100);
                                        return (
                                            <div key={i} className="space-y-1.5">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500 font-medium">{op.label}</span>
                                                    <span className="font-bold text-slate-900">
                                                        {usageLoading ? "..." : `${mbValue} MB / ${op.limitLabel}`}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 ${op.color}`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between items-center text-[10px]">
                                                    <span className="text-slate-400 font-medium">Квотын ашиглалт</span>
                                                    <span className={percent > 90 ? "text-red-500 font-bold" : "text-slate-500"}>
                                                        {percent.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="mt-4 text-[9px] text-slate-400 leading-relaxed uppercase font-bold tracking-wider">
                                    Firebase Free Tier (Blaze Plan)
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Basic System Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Globe className="w-5 h-5 text-blue-600" />
                            Ерөнхий тохиргоо
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Системийн нэр</label>
                                <Input defaultValue="Шалгалтын систем" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Үндсэн хэл</label>
                                <Select defaultValue="mn">
                                    <option value="mn">Монгол</option>
                                    <option value="en">English</option>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div >
    );
}
