"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import {
    collection, query, where, getDocs,
} from "firebase/firestore";
import { GraduationCap, Plus, Users } from "lucide-react";
import Link from "next/link";
import { UserProfile } from "@/types";
import { toast } from "sonner";

export default function ChildrenPage() {
    const { profile, user } = useAuth();
    const [children, setChildren] = useState<UserProfile[]>([]);
    const [loadingChildren, setLoadingChildren] = useState(true);

    useEffect(() => {
        if (!user || !profile) return;
        let cancelled = false;

        const fetchChildren = async () => {
            setLoadingChildren(true);
            try {
                const childIds: string[] = profile.children || [];
                if (childIds.length === 0) {
                    if (!cancelled) setChildren([]);
                    return;
                }
                const q = query(
                    collection(db, "users"),
                    where("uid", "in", childIds.slice(0, 10))
                );
                const snap = await getDocs(q);
                if (cancelled) return;
                setChildren(snap.docs.map(d => d.data() as UserProfile));
            } catch (err: unknown) {
                if (cancelled) return;
                console.error("[fetchChildren]", err);
                const msg = err instanceof Error ? err.message : "Хүүхдийн мэдээллийг татахад алдаа гарлаа";
                toast.error(msg);
            } finally {
                if (!cancelled) setLoadingChildren(false);
            }
        };

        fetchChildren();
        return () => { cancelled = true; };
    }, [user, profile]);

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-16">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/parent">
                        <Button variant="ghost" size="sm">← Буцах</Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">Хүүхдийн жагсаалт</h1>
                        <p className="text-slate-500 text-sm mt-0.5">Бүртгэгдсэн хүүхдүүдийн мэдээлэл</p>
                    </div>
                </div>
                <Link href="/parent/children/add">
                    <Button className="bg-violet-600 hover:bg-violet-700 text-white font-bold gap-2">
                        <Plus className="w-4 h-4" />
                        Хүүхэд нэмэх
                    </Button>
                </Link>
            </div>

            {/* Children list */}
            {loadingChildren ? (
                <div className="text-center text-slate-400 py-12">Уншиж байна...</div>
            ) : children.length === 0 ? (
                <Card className="border-0 shadow-md rounded-2xl">
                    <CardContent className="p-12 text-center space-y-4">
                        <Users className="w-12 h-12 text-slate-300 mx-auto" />
                        <p className="text-slate-500 font-medium">Одоогоор бүртгэгдсэн хүүхэд байхгүй байна.</p>
                        <Link href="/parent/children/add">
                            <Button className="bg-violet-600 hover:bg-violet-700 text-white font-bold gap-2 mt-2">
                                <Plus className="w-4 h-4" />
                                Хүүхэд нэмэх
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {children.map((child) => (
                        <Card key={child.uid} className="border-0 shadow-md rounded-2xl overflow-hidden">
                            <div className="bg-emerald-600 p-4 text-white flex items-center gap-3">
                                <GraduationCap className="w-5 h-5" />
                                <p className="font-black text-lg">
                                    {child.lastName} {child.firstName}
                                </p>
                            </div>
                            <CardContent className="p-5 space-y-2 text-sm text-slate-700">
                                {child.studentCode && (
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-500">Нэвтрэх код:</span>
                                        <span className="font-mono font-black tracking-widest">{child.studentCode}</span>
                                    </div>
                                )}
                                {child.school && (
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-500">Сургууль:</span>
                                        <span>{child.school}</span>
                                    </div>
                                )}
                                {child.class && (
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-500">Анги:</span>
                                        <span>{child.class}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
