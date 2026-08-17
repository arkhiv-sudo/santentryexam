"use client";

import { useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import StudentExcelImport from "@/components/admin/StudentExcelImport";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/ModalProvider";
import { KeyRound, Search, Users, Loader2 } from "lucide-react";

export default function AdminStudentsPage() {
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [search, setSearch] = useState("");
    const [gradeFilter, setGradeFilter] = useState("");
    const [regeneratingUid, setRegeneratingUid] = useState<string | null>(null);

    const { data: students = [], isLoading } = useQuery<UserProfile[]>({
        queryKey: ["students"],
        queryFn: async () => {
            const snap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
            return snap.docs.map(d => ({ uid: d.id, ...d.data() }) as UserProfile);
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return students
            .filter(s => s.status !== "archived")
            .filter(s => !gradeFilter || s.grade === gradeFilter)
            .filter(s => {
                if (!term) return true;
                return (
                    `${s.lastName || ""} ${s.firstName || ""}`.toLowerCase().includes(term) ||
                    (s.phone || "").includes(term) ||
                    (s.examCode || "").toLowerCase().includes(term)
                );
            })
            .sort((a, b) => {
                const g = (parseInt(a.grade || "0") || 0) - (parseInt(b.grade || "0") || 0);
                if (g !== 0) return g;
                return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "mn");
            });
    }, [students, search, gradeFilter]);

    const withCode = students.filter(s => s.examCode && s.status !== "archived").length;

    const handleRegenerate = async (student: UserProfile) => {
        const ok = await confirm({
            title: "Нэвтрэх код шинэчлэх",
            message: `${student.lastName} ${student.firstName}-д шинэ код үүсгэх үү? Хуучин код нь ажиллахаа болино.`,
            confirmLabel: "Шинэчлэх",
        });
        if (!ok) return;

        setRegeneratingUid(student.uid);
        try {
            const res = await fetch("/api/admin/students/regenerate-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: student.uid }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Алдаа гарлаа");
            toast.success(`Шинэ код: ${data.examCode}`);
            queryClient.invalidateQueries({ queryKey: ["students"] });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Код шинэчлэхэд алдаа гарлаа");
        } finally {
            setRegeneratingUid(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl bg-linear-to-r from-slate-50 to-blue-50/50 px-6 py-5 border border-slate-200 shadow-sm">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">Сурагчид</h1>
                <p className="text-slate-500 mt-1 text-sm">
                    Excel-ээс сурагч импортлох, нэвтрэх кодыг харах, шинэчлэх
                </p>
            </div>

            <StudentExcelImport onImported={() => queryClient.invalidateQueries({ queryKey: ["students"] })} />

            <Card className="border-0 shadow-lg">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-600" />
                        Бүртгэлтэй сурагчид
                        <span className="text-sm font-normal text-slate-500">
                            ({visible.length} / кодтой: {withCode})
                        </span>
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <Input
                                placeholder="Нэр, утас, код хайх..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 w-56"
                            />
                        </div>
                        <Select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} className="w-36">
                            <option value="">Бүх анги</option>
                            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(g => (
                                <option key={g} value={g}>{g}-р анги</option>
                            ))}
                        </Select>
                    </div>
                </CardHeader>

                <CardContent>
                    {isLoading ? (
                        <div className="py-12 text-center text-slate-500">Уншиж байна...</div>
                    ) : visible.length === 0 ? (
                        <div className="py-12 text-center text-slate-500">Сурагч олдсонгүй</div>
                    ) : (
                        <div className="relative overflow-x-auto">
                            <table className="w-full text-sm text-left text-slate-500">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3">Овог</th>
                                        <th className="px-6 py-3">Нэр</th>
                                        <th className="px-6 py-3">Анги</th>
                                        <th className="px-6 py-3">Утас</th>
                                        <th className="px-6 py-3">Нэвтрэх код</th>
                                        <th className="px-6 py-3">Үйлдэл</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map(student => (
                                        <tr key={student.uid} className="bg-white border-b border-slate-100">
                                            <td className="px-6 py-3 font-medium text-slate-900">{student.lastName}</td>
                                            <td className="px-6 py-3 font-medium text-slate-900">{student.firstName}</td>
                                            <td className="px-6 py-3">{student.grade ? `${student.grade}-р анги` : "—"}</td>
                                            <td className="px-6 py-3 font-mono">{student.phone || "—"}</td>
                                            <td className="px-6 py-3">
                                                {student.examCode ? (
                                                    <span className="font-mono font-black text-base tracking-widest text-blue-700 bg-blue-50 px-2.5 py-1 rounded">
                                                        {student.examCode}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1.5"
                                                    disabled={!student.phone || regeneratingUid === student.uid}
                                                    onClick={() => handleRegenerate(student)}
                                                    title={student.phone ? "Шинэ код үүсгэх" : "Утасны дугааргүй тул код өгөх боломжгүй"}
                                                >
                                                    {regeneratingUid === student.uid
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <KeyRound className="w-3.5 h-3.5" />}
                                                    Код шинэчлэх
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
