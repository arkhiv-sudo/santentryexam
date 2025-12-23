"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Users, FileQuestion, ClipboardList, Settings, TrendingUp, Award, BookOpen } from "lucide-react";

export default function AdminDashboard() {
    const { profile, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, loading, router]);

    if (loading) return <div className="p-8 text-center">Уншиж байна...</div>;

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
        { label: "Нийт хэрэглэгч", value: "-", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Нийт асуулт", value: "-", icon: BookOpen, color: "text-green-600", bg: "bg-green-50" },
        { label: "Идэвхтэй шалгалт", value: "-", icon: Award, color: "text-purple-600", bg: "bg-purple-50" }
    ];

    return (
        <div className="space-y-8">
            {/* Subtle Header */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-50 to-blue-50 p-8 border border-slate-200">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">Админы хянах самбар</h1>
                    <p className="text-slate-600 text-lg">
                        Тавтай морил, {profile?.lastName} {profile?.firstName}
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                {statsCards.map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={idx} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-600 mb-1">{stat.label}</p>
                                        <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                                    </div>
                                    <div className={`${stat.bg} p-4 rounded-2xl`}>
                                        <Icon className={`w-8 h-8 ${stat.color}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Main Navigation Cards */}
            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Удирдлагын хэсгүүд</h2>
                <div className="grid gap-6 md:grid-cols-2">
                    {adminCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <Link key={card.href} href={card.href} className="group block h-full">
                                <Card className="relative h-full border-0 shadow-lg group-hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden group-hover:-translate-y-2">
                                    <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
                                    <CardHeader className="relative">
                                        <div className={`w-14 h-14 rounded-2xl ${card.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                                            <Icon className={`w-7 h-7 ${card.iconColor}`} />
                                        </div>
                                        <CardTitle className="text-2xl group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-purple-600 transition-all duration-300">
                                            {card.title}
                                        </CardTitle>
                                        <CardDescription className="text-base text-slate-600 mt-2">
                                            {card.description}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center text-sm font-medium text-blue-600 group-hover:text-purple-600 transition-colors">
                                            Нээх
                                            <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
