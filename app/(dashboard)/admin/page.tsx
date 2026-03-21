"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, FileQuestion, ClipboardList, Settings, Award, BookOpen, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

const STATS_CACHE_KEY = "admin_stats_cache";

export default function AdminDashboard() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();

    // Initial state from localStorage if available
    const [stats, setStats] = useState(() => {
        if (typeof window !== 'undefined') {
            const cached = localStorage.getItem(STATS_CACHE_KEY);
            return cached ? JSON.parse(cached) : { totalUsers: 0, totalQuestions: 0, totalExams: 0 };
        }
        return { totalUsers: 0, totalQuestions: 0, totalExams: 0 };
    });

    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    useEffect(() => {
        if (profile?.role !== "admin") return;

        // Real-time listener for statistics (unified to system/stats)
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
            }
            setLoadingStats(false);
        }, (error) => {
            console.error("Stats listener error:", error);
            setLoadingStats(false);
        });

        return () => unsubscribe();
    }, [profile]);

    if (authLoading) return <div className="p-8 text-center text-slate-500">Уншиж байна...</div>;

    const adminCards = [
        {
            title: "Хэрэглэгчийн удирдлага",
            description: "Хэрэглэгчдийг үүсгэх, засах, эрх өөрчлөх",
            icon: Users,
            href: "/admin/users",
            gradient: "from-blue-500 to-cyan-500",
            iconBg: "bg-blue-100",
            iconColor: "text-blue-600"
        },
        {
            title: "Асуултын сан",
            description: "Бүх асуултуудыг харах, шүүх, устгах",
            icon: FileQuestion,
            href: "/admin/questions",
            gradient: "from-green-500 to-emerald-500",
            iconBg: "bg-green-100",
            iconColor: "text-green-600"
        },
        {
            title: "Шалгалтын удирдлага",
            description: "Шалгалтуудыг үүсгэх, засах, устгах",
            icon: ClipboardList,
            href: "/admin/exams",
            gradient: "from-purple-500 to-pink-500",
            iconBg: "bg-purple-100",
            iconColor: "text-purple-600"
        },
        {
            title: "Системийн тохиргоо",
            description: "Ерөнхий тохиргоо болон параметрүүд",
            icon: Settings,
            href: "/admin/settings",
            gradient: "from-slate-500 to-zinc-500",
            iconBg: "bg-slate-100",
            iconColor: "text-slate-600"
        }
    ];

    const statsCards = [
        { label: "Нийт хэрэглэгч", value: stats.totalUsers, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Нийт асуулт", value: stats.totalQuestions, icon: BookOpen, color: "text-green-600", bg: "bg-green-50" },
        { label: "Идэвхтэй шалгалт", value: stats.totalExams, icon: Award, color: "text-purple-600", bg: "bg-purple-50" }
    ];

    return (
        <div className="space-y-5">
            {/* Compact Header */}
            <div className="relative overflow-hidden rounded-xl bg-linear-to-r from-slate-800 to-slate-900 px-6 py-5 border border-slate-700 shadow-sm text-white">
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0 border border-white/5">
                        <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight mb-0.5">Админы хянах самбар</h1>
                        <p className="text-slate-400 text-xs font-medium">
                            Тавтай морил, {profile?.lastName} {profile?.firstName}
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                {statsCards.map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={idx} className="border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className={`${stat.bg} w-12 h-12 rounded-xl flex items-center justify-center shrink-0`}>
                                    <Icon className={`w-6 h-6 ${stat.color}`} />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{stat.label}</p>
                                    <p className="text-2xl font-black text-slate-900">
                                        {loadingStats ? "..." : stat.value}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Main Navigation Cards */}
            <div className="space-y-4">
                <h2 className="text-sm flex items-center gap-2 font-bold text-slate-800 uppercase tracking-wider">
                    <div className="w-1.5 h-4 bg-slate-800 rounded-full" />
                    Удирдлагын хэсгүүд
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {adminCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <Link key={card.href} href={card.href} className="group block h-full">
                                <Card className="relative h-full border border-slate-200 shadow-sm group-hover:border-slate-300 group-hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden">
                                    <div className={`absolute inset-0 bg-linear-to-br ${card.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300`}></div>
                                    <CardHeader className="relative p-5">
                                        <div className="flex items-center gap-3">
                                            <div className={`${card.iconBg} w-10 h-10 rounded-lg flex items-center justify-center shrink-0`}>
                                                <Icon className={`w-5 h-5 ${card.iconColor}`} />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                                    {card.title}
                                                </CardTitle>
                                                <CardDescription className="text-xs text-slate-500 mt-0.5">
                                                    {card.description}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
