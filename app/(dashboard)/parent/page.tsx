"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
    Trophy, Bell, BellOff, Users, GraduationCap, Calendar,
    CheckCircle, Clock, AlertCircle, Loader2, Eye
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import {
    collection, query, where, getDocs, doc, getDoc,
    updateDoc, orderBy, onSnapshot
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile, ExamResult, Notification } from "@/types";
import { ExamService } from "@/lib/services/exam-service";
import { toast } from "sonner";
import Link from "next/link";
import { UserPlus, Key } from "lucide-react";

export default function ParentDashboard() {
    const { profile } = useAuth();

    const [children, setChildren] = useState<UserProfile[]>([]);
    const [results, setResults] = useState<ExamResult[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    // ── Load children profiles ──────────────────────────────────────────────
    const loadChildren = useCallback(async () => {
        if (!profile?.children?.length) {
            setLoading(false);
            return;
        }

        try {
            const childProfiles: UserProfile[] = [];
            for (const childId of profile.children) {
                const snap = await getDoc(doc(db, "users", childId));
                if (snap.exists()) {
                    childProfiles.push({ uid: snap.id, ...snap.data() } as UserProfile);
                }
            }
            setChildren(childProfiles);

            // Load results for all children
            const childIds = childProfiles.map(c => c.uid);
            const examResults = await ExamService.getResultsForStudents(childIds);
            setResults(examResults);
        } catch (err) {
            console.error("Failed to load children data:", err);
        } finally {
            setLoading(false);
        }
    }, [profile?.children]);

    useEffect(() => {
        loadChildren();
    }, [loadChildren]);

    // ── Real-time notifications listener ───────────────────────────────────
    useEffect(() => {
        if (!profile?.uid) return;

        const q = query(
            collection(db, "notifications"),
            where("recipientId", "==", profile.uid),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, snapshot => {
            const notifs: Notification[] = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    type: data.type,
                    recipientId: data.recipientId,
                    studentId: data.studentId,
                    studentName: data.studentName,
                    examId: data.examId,
                    examTitle: data.examTitle,
                    message: data.message,
                    score: data.score,
                    maxScore: data.maxScore,
                    percentage: data.percentage,
                    read: data.read,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                } as Notification;
            });
            setNotifications(notifs);

            // Show toast for new unread score notifications
            const newScoreNotifs = notifs.filter(n => !n.read && n.type === "score_available");
            if (newScoreNotifs.length > 0) {
                toast.success(`${newScoreNotifs[0].studentName}-ийн шалгалтын дүн гарлаа!`);
            }
        });

        return () => unsubscribe();
    }, [profile?.uid]);

    // ── Mark notification as read ──────────────────────────────────────────
    const markAsRead = async (notifId: string) => {
        try {
            await updateDoc(doc(db, "notifications", notifId), { read: true });
        } catch {
            // ignore
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    // ── Per-child stats ─────────────────────────────────────────────────────
    const getChildStats = (childId: string) => {
        const childResults = results.filter(r => r.studentId === childId);
        if (!childResults.length) return null;
        const avg = Math.round(childResults.reduce((s, r) => s + r.percentage, 0) / childResults.length);
        const best = Math.max(...childResults.map(r => r.percentage));
        return { count: childResults.length, avg, best };
    };

    const getScoreColor = (pct: number) => {
        if (pct >= 80) return "text-emerald-600";
        if (pct >= 60) return "text-blue-600";
        if (pct >= 40) return "text-amber-600";
        return "text-red-600";
    };

    const getScoreBg = (pct: number) => {
        if (pct >= 80) return "bg-emerald-50 border-emerald-200";
        if (pct >= 60) return "bg-blue-50 border-blue-200";
        if (pct >= 40) return "bg-amber-50 border-amber-200";
        return "bg-red-50 border-red-200";
    };

    const getNotifIcon = (type: string) => {
        if (type === "exam_started") return <Clock className="w-4 h-4 text-blue-600" />;
        if (type === "score_available") return <Trophy className="w-4 h-4 text-emerald-600" />;
        return <Bell className="w-4 h-4 text-slate-400" />;
    };

    return (
        <div className="space-y-5 pb-10">
            {/* Compact Header */}
            <div className="relative overflow-hidden rounded-2xl bg-linear-to-r from-violet-600 to-purple-600 px-6 py-5 text-white shadow-lg shadow-violet-200/50">
                <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                            <Users className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-violet-200 text-xs font-semibold uppercase tracking-widest">Асран хамгаалагч</p>
                            <h1 className="text-xl font-bold text-white leading-tight">
                                Сайн байна уу, {profile?.lastName} {profile?.firstName}!
                            </h1>
                            <p className="text-violet-200 text-xs mt-0.5">Эцэг эхийн хянах самбар</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-center bg-white/15 backdrop-blur rounded-xl px-4 py-2.5">
                            <div className="text-2xl font-black text-white">{children.length}</div>
                            <div className="text-[10px] text-violet-100 font-semibold uppercase tracking-wider">Хүүхэд</div>
                        </div>
                        <div className="text-center bg-white/15 backdrop-blur rounded-xl px-4 py-2.5">
                            <div className="text-2xl font-black text-white">{results.length}</div>
                            <div className="text-[10px] text-violet-100 font-semibold uppercase tracking-wider">Дүн</div>
                        </div>
                        {unreadCount > 0 && (
                            <div className="text-center bg-amber-400/90 backdrop-blur rounded-xl px-4 py-2.5">
                                <div className="text-2xl font-black text-amber-900">{unreadCount}</div>
                                <div className="text-[10px] text-amber-800 font-semibold uppercase tracking-wider">Шинэ</div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/5 rounded-full blur-2xl" />
            </div>

            <div className="grid lg:grid-cols-3 gap-5">
                {/* Left: children + results */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Children section */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm flex items-center gap-2 font-bold text-slate-800 uppercase tracking-wider">
                                <div className="w-1.5 h-4 bg-violet-600 rounded-full" />
                                Миний хүүхдүүд
                            </h2>
                            <Link href="/parent/children/add">
                                <Button className="bg-violet-600 hover:bg-violet-700 text-white gap-2 rounded-xl shadow-md">
                                    <UserPlus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Хүүхэд нэмэх</span>
                                </Button>
                            </Link>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-20 bg-white rounded-3xl border border-slate-100">
                                <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                            </div>
                        ) : children.length === 0 ? (
                            <Card className="border-dashed border-2 border-slate-200 bg-slate-50/30 rounded-3xl">
                                <CardContent className="p-12 text-center space-y-3">
                                    <Users className="w-12 h-12 text-slate-300 mx-auto" />
                                    <p className="text-slate-500 font-medium">Холбогдсон хүүхэд байхгүй байна.</p>
                                    <p className="text-slate-400 text-sm">Хүүхдийн бүртгүүлэх үед таны имэйл хаягийг заавал оруулна.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                {children.map(child => {
                                    const stats = getChildStats(child.uid);
                                    return (
                                        <Card key={child.uid} className="rounded-3xl border-0 shadow-lg overflow-hidden">
                                            <CardContent className="p-6">
                                                <div className="flex items-start gap-5">
                                                    <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
                                                        {child.firstName?.[0] || "?"}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h3 className="text-base font-bold text-slate-900">
                                                            {child.lastName} {child.firstName}
                                                        </h3>
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            <span className="flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                                                                <GraduationCap className="w-3 h-3" /> {child.class || "—"} анги
                                                            </span>
                                                            {child.school && (
                                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                                                                    {child.school}
                                                                </span>
                                                            )}
                                                            {child.aimag && (
                                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                                                                    {child.aimag}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {(child.studentCode || child.tempPassword) && (
                                                            <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                                                        <Key className="w-4 h-4" />
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Нэвтрэх код</div>
                                                                        <div className="text-sm font-black text-slate-800 font-mono tracking-widest">{child.studentCode || "—"}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="border-l border-slate-200 pl-4">
                                                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Нууц үг</div>
                                                                    <div className="text-sm font-bold text-slate-800">{child.tempPassword || "—"}</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {stats ? (
                                                            <div className="grid grid-cols-3 gap-3 mt-4">
                                                                <div className="bg-slate-50 rounded-xl p-3 text-center">
                                                                    <div className="text-lg font-black text-slate-800">{stats.count}</div>
                                                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Шалгалт</div>
                                                                </div>
                                                                <div className={`rounded-xl p-3 text-center border ${getScoreBg(stats.avg)}`}>
                                                                    <div className={`text-lg font-black ${getScoreColor(stats.avg)}`}>{stats.avg}%</div>
                                                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Дундаж</div>
                                                                </div>
                                                                <div className={`rounded-xl p-3 text-center border ${getScoreBg(stats.best)}`}>
                                                                    <div className={`text-lg font-black ${getScoreColor(stats.best)}`}>{stats.best}%</div>
                                                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Хамгийн өндөр</div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-slate-400 mt-3 italic">Шалгалтын дүн байхгүй байна.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Results section */}
                    {results.length > 0 && (
                        <div>
                            <h2 className="text-sm flex items-center gap-2 font-bold text-slate-800 uppercase tracking-wider mb-4">
                                <div className="w-1.5 h-4 bg-emerald-600 rounded-full" />
                                Шалгалтын дүнгүүд
                            </h2>
                            <div className="space-y-3">
                                {results.slice(0, 20).map(result => (
                                    <div key={result.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl border-2 ${getScoreBg(result.percentage)} ${getScoreColor(result.percentage)}`}>
                                            {result.percentage}%
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-black text-slate-800 truncate">{result.examTitle}</p>
                                            <p className="text-xs text-slate-500 font-medium mt-0.5 flex flex-wrap items-center gap-1.5">
                                                <span>{result.studentName} • {result.score}/{result.maxScore} оноо</span>
                                                {result.passed !== undefined && (
                                                    <span className={`px-1.5 py-0.5 rounded font-bold ${result.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                        {result.passed ? "Тэнцсэн" : "Тэнцээгүй"}
                                                    </span>
                                                )}
                                                {result.rank && result.passed && (
                                                    <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                                                        {result.rank}-р байр
                                                    </span>
                                                )}
                                                <span>• {result.gradedAt.toLocaleDateString("mn-MN")}</span>
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            {result.percentage >= 80 ? (
                                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                            ) : result.percentage >= 50 ? (
                                                <AlertCircle className="w-5 h-5 text-amber-500" />
                                            ) : (
                                                <AlertCircle className="w-5 h-5 text-red-400" />
                                            )}
                                            <Link href={`/parent/exam-review/${result.examId}?studentId=${result.studentId}`}>
                                                <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold gap-1 px-2 border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50">
                                                    <Eye className="w-3 h-3" />
                                                    Хариулт харах
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: notifications */}
                <div>
                    <h2 className="text-sm flex items-center justify-between font-bold text-slate-800 uppercase tracking-wider mb-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-4 rounded-full ${unreadCount > 0 ? 'bg-amber-500' : 'bg-slate-400'}`} />
                            Мэдэгдлүүд
                        </div>
                        {unreadCount > 0 && (
                            <span className="bg-amber-500 text-white text-xs font-black px-2 py-0.5 rounded-full">
                                {unreadCount} шинэ
                            </span>
                        )}
                    </h2>

                    <div className="space-y-3">
                        {notifications.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                                <BellOff className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-400 font-medium text-sm">Мэдэгдэл байхгүй байна</p>
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <div
                                    key={notif.id}
                                    onClick={() => { if (!notif.read) markAsRead(notif.id); }}
                                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                                        notif.read
                                            ? "bg-white border-slate-100 opacity-70"
                                            : "bg-amber-50 border-amber-200 shadow-md hover:shadow-lg"
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 shrink-0">{getNotifIcon(notif.type)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 leading-snug">
                                                {notif.message}
                                            </p>
                                            {notif.percentage !== undefined && notif.percentage !== null && (
                                                <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${getScoreBg(notif.percentage)} ${getScoreColor(notif.percentage)}`}>
                                                    <Trophy className="w-3 h-3" />
                                                    {notif.score}/{notif.maxScore} ({notif.percentage}%)
                                                </div>
                                            )}
                                            <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                                                {notif.createdAt.toLocaleString("mn-MN")}
                                            </p>
                                        </div>
                                        {!notif.read && (
                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Exam schedule for children */}
                    {children.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-sm flex items-center gap-2 font-bold text-slate-800 uppercase tracking-wider mb-4">
                                <div className="w-1.5 h-4 bg-violet-600 rounded-full" />
                                Шалгалтын хуваарь
                            </h3>
                            <ExamScheduleForChildren childProfiles={children} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Sub-component: upcoming exams for children ────────────────────────────────
function ExamScheduleForChildren({ childProfiles }: { childProfiles: UserProfile[] }) {
    const [upcomingExams, setUpcomingExams] = useState<Array<{
        examId: string;
        title: string;
        scheduledAt: Date;
        grade: string;
        childName: string;
    }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const results: typeof upcomingExams = [];
                for (const child of childProfiles) {
                    const grade = child.grade || child.class?.match(/\d+/)?.[0] || "";
                    if (!grade) continue;

                    const q = query(
                        collection(db, "exams"),
                        where("grade", "==", grade),
                        where("status", "==", "published")
                    );
                    const snap = await getDocs(q);
                    snap.docs.forEach(d => {
                        const data = d.data();
                        const scheduledAt = data.scheduledAt?.toDate ? data.scheduledAt.toDate() : new Date(data.scheduledAt);
                        if (scheduledAt > new Date()) {
                            results.push({
                                examId: d.id,
                                title: data.title,
                                scheduledAt,
                                grade,
                                childName: `${child.lastName} ${child.firstName}`.trim(),
                            });
                        }
                    });
                }
                results.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
                setUpcomingExams(results.slice(0, 5));
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [childProfiles]);

    if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>;
    if (upcomingExams.length === 0) return <p className="text-sm text-slate-400 italic">Тун удахгүй болох шалгалт байхгүй байна.</p>;

    return (
        <div className="space-y-3">
            {upcomingExams.map((exam, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                        <Calendar className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{exam.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {exam.childName} • {exam.grade}-р анги
                        </p>
                        <p className="text-xs font-bold text-violet-600 mt-1">
                            {exam.scheduledAt.toLocaleString("mn-MN")}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
