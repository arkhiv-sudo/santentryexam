"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ClipboardList, PlusCircle, BookOpen, Users } from "lucide-react";
import Link from "next/link";

export default function TeacherDashboard() {
    const { profile } = useAuth();

    const teacherCards = [
        {
            title: "Шалгалт үүсгэх",
            description: "Шинэ шалгалт үүсгэж, асуултууд нэмэх",
            icon: PlusCircle,
            href: "/teacher/exams/create",
            gradient: "from-blue-500 to-indigo-500",
            iconBg: "bg-blue-100",
            iconColor: "text-blue-600"
        },
        {
            title: "Миний асуултууд",
            description: "Таны үүсгэсэн асуултуудын сан",
            icon: BookOpen,
            href: "/admin/questions", // Temporarily using admin questions with filter logic
            gradient: "from-emerald-500 to-teal-500",
            iconBg: "bg-emerald-100",
            iconColor: "text-emerald-600"
        }
    ];

    return (
        <div className="space-y-8">
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-50 to-blue-50 p-8 border border-slate-200">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">Багшийн хянах самбар</h1>
                <p className="text-slate-600 text-lg">
                    Тавтай морил, {profile?.lastName} {profile?.firstName} багшаа
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {teacherCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Link key={card.href} href={card.href} className="group block">
                            <Card className="relative h-full border-0 shadow-lg group-hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden group-hover:-translate-y-2">
                                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
                                <CardHeader>
                                    <div className={`w-14 h-14 rounded-2xl ${card.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                                        <Icon className={`w-7 h-7 ${card.iconColor}`} />
                                    </div>
                                    <CardTitle className="text-2xl group-hover:text-blue-600 transition-colors">
                                        {card.title}
                                    </CardTitle>
                                    <CardDescription className="text-base text-slate-600 mt-2">
                                        {card.description}
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
