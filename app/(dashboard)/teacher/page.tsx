"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ClipboardList, PlusCircle, BookOpen } from "lucide-react";
import Link from "next/link";

export default function TeacherDashboard() {
    const { profile } = useAuth();

    const teacherCards = [
        {
            title: "Асуулт үүсгэх",
            description: "Шинэ асуулт үүсгэж сан-даа нэмэх",
            icon: PlusCircle,
            href: "/teacher/questions/create",
            gradient: "from-blue-500 to-indigo-500",
            iconBg: "bg-blue-100",
            iconColor: "text-blue-600"
        },
        {
            title: "Асуултын сан",
            description: "Таны үүсгэсэн асуултуудыг удирдах",
            icon: BookOpen,
            href: "/teacher/questions",
            gradient: "from-emerald-500 to-teal-500",
            iconBg: "bg-emerald-100",
            iconColor: "text-emerald-600"
        },
        {
            title: "Шалгалтууд",
            description: "Шалгалтын жагсаалт болон асуултын дутууг харах",
            icon: ClipboardList,
            href: "/teacher/exams",
            gradient: "from-purple-500 to-pink-500",
            iconBg: "bg-purple-100",
            iconColor: "text-purple-600"
        }
    ];

    return (
        <div className="space-y-6 pb-10">
            {/* Compact Header */}
            <div className="relative overflow-hidden rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 px-6 py-5 border border-emerald-500 shadow-sm text-white">
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0 border border-white/10 backdrop-blur-sm">
                        <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <p className="text-emerald-100 text-xs font-semibold uppercase tracking-widest mb-0.5">Багш</p>
                        <h1 className="text-xl font-bold tracking-tight">Багшийн хянах самбар</h1>
                        <p className="text-emerald-50 text-xs font-medium mt-0.5">
                            Тавтай морил, {profile?.lastName} {profile?.firstName} багшаа
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {teacherCards.map((card) => {
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
                                            <CardTitle className="text-base font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
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
    );
}
