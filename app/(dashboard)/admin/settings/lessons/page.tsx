"use client";

import { useState } from "react";
import { SettingsService } from "@/lib/services/settings-service";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { toast } from "sonner";
import { Trash2, Plus, ArrowLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/providers/ModalProvider";

export default function AdminLessonsPage() {
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [newName, setNewName] = useState("");
    const [adding, setAdding] = useState(false);

    const { data: lessons = [], isLoading } = useQuery({
        queryKey: ["lessons"],
        queryFn: () => SettingsService.getLessons(),
        staleTime: 60 * 60 * 1000,
    });

    const { data: subjects = [] } = useQuery({
        queryKey: ["subjects"],
        queryFn: () => SettingsService.getSubjects(),
        staleTime: 60 * 60 * 1000,
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) {
            toast.error("Хичээлийн нэрийг бичнэ үү");
            return;
        }
        setAdding(true);
        try {
            await SettingsService.createLesson(newName.trim());
            setNewName("");
            queryClient.invalidateQueries({ queryKey: ["lessons"] });
            toast.success("Хичээл амжилттай нэмэгдлээ");
        } catch {
            toast.error("Алдаа гарлаа");
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        const subjectCount = subjects.filter(s => s.lessonId === id).length;
        const confirmed = await confirm({
            title: "Хичээлийг устгах",
            message: subjectCount > 0
                ? `"${name}" хичээлд ${subjectCount} сэдэв холбоотой байна. Устгах уу?`
                : `"${name}" хичээлийг устгахдаа итгэлтэй байна уу?`,
            confirmLabel: "Устгах",
            variant: "destructive"
        });
        if (!confirmed) return;
        try {
            await SettingsService.deleteLesson(id);
            queryClient.invalidateQueries({ queryKey: ["lessons"] });
            toast.success("Хичээл устгагдлаа");
        } catch {
            toast.error("Устгахад алдаа гарлаа");
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
            <div className="flex items-center gap-4">
                <Link href="/admin">
                    <button className="p-2 hover:bg-slate-100 rounded-full">
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Хичээлүүд удирдах</h1>
                    <p className="text-sm text-slate-500">Хичээл нэмэх, устгах</p>
                </div>
                <Link href="/admin/settings/subjects" className="ml-auto">
                    <Button variant="outline" className="gap-2 text-sm">
                        Сэдвүүд →
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add Form */}
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader><CardTitle>Шинэ хичээл нэмэх</CardTitle></CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1 block">Хичээлийн нэр</label>
                                    <Input
                                        placeholder="Жишээ: Математик"
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        required
                                    />
                                </div>
                                <Button type="submit" disabled={adding} className="w-full bg-violet-600 hover:bg-violet-700">
                                    <Plus className="w-4 h-4 mr-2" />
                                    {adding ? "Нэмж байна..." : "Хичээл нэмэх"}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Lessons List */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Бүртгэлтэй хичээлүүд ({lessons.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isLoading && <div className="py-8 text-center text-slate-500">Ачаалж байна...</div>}
                            {!isLoading && lessons.length === 0 && (
                                <div className="py-12 text-center">
                                    <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 italic">Хичээл байхгүй байна</p>
                                </div>
                            )}
                            <div className="divide-y divide-slate-100">
                                {lessons.map((lesson) => {
                                    const subjectCount = subjects.filter(s => s.lessonId === lesson.id).length;
                                    return (
                                        <div key={lesson.id} className="py-3 flex justify-between items-center group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                                                    <BookOpen className="w-4 h-4 text-violet-600" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-slate-900">{lesson.name}</div>
                                                    <div className="text-xs text-slate-400">{subjectCount} сэдэв</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDelete(lesson.id, lesson.name)}
                                                className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
