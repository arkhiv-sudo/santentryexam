"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ClipboardList, Trophy, GraduationCap, Clock } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam } from "@/types";

export default function StudentDashboard() {
    const { profile } = useAuth();
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchExams = async () => {
            try {
                const q = query(collection(db, "exams"), where("status", "==", "published"));
                const querySnapshot = await getDocs(q);
                const fetchedExams = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Exam[];
                setExams(fetchedExams);
            } catch (error) {
                console.error("Error fetching exams:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchExams();
    }, []);

    return (
        <div className="space-y-8">
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-8 border border-slate-200">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">Сурагчийн хянах самбар</h1>
                <p className="text-slate-600 text-lg">
                    Сайн байна уу, {profile?.lastName} {profile?.firstName}
                </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                {/* Available Exams */}
                <div className="lg:col-span-2 space-y-6">
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center">
                        <GraduationCap className="w-7 h-7 mr-3 text-blue-600" />
                        Идэвхтэй шалгалтууд
                    </h2>

                    <div className="grid gap-4">
                        {loading ? (
                            <p className="text-slate-500">Уншиж байна...</p>
                        ) : exams.length === 0 ? (
                            <Card className="p-8 text-center text-slate-500 border-dashed">
                                Идэвхтэй шалгалт одоогоор байхгүй байна.
                            </Card>
                        ) : (
                            exams.map((exam) => (
                                <Link key={exam.id} href={`/student/exam/${exam.id}`}>
                                    <Card className="hover:shadow-xl transition-all duration-300 group cursor-pointer border-l-4 border-l-blue-500">
                                        <CardContent className="p-6">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                                                        {exam.title}
                                                    </h3>
                                                    <div className="flex items-center text-slate-500 text-sm gap-4">
                                                        <span className="flex items-center">
                                                            <Clock className="w-4 h-4 mr-1" />
                                                            {exam.duration} минут
                                                        </span>
                                                        <span className="flex items-center">
                                                            <ClipboardList className="w-4 h-4 mr-1" />
                                                            {exam.questionIds?.length || 0} асуулт
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                    Эхлэх
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))
                        )}
                    </div>
                </div>

                {/* Sidebar Stats */}
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center">
                        <Trophy className="w-7 h-7 mr-3 text-amber-500" />
                        Миний амжилт
                    </h2>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Сүүлийн шалгалтууд</CardTitle>
                        </CardHeader>
                        <CardContent className="text-center py-8 text-slate-500 italic">
                            Тун удахгүй...
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
