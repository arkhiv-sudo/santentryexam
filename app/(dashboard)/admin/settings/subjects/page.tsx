"use client";

import { useState, useEffect, useRef } from "react";
import { SettingsService } from "@/lib/services/settings-service";
import { Grade, Subject } from "@/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { toast } from "sonner";
import { Trash2, Plus, ArrowLeft, Download, Upload, Save, X } from "lucide-react";
import Link from "next/link";

const GRADES_MAP: Record<string, string> = {
    "1": "1-р анги", "2": "2-р анги", "3": "3-р анги", "4": "4-р анги",
    "5": "5-р анги", "6": "6-р анги", "7": "7-р анги", "8": "8-р анги",
    "9": "9-р анги", "10": "10-р анги", "11": "11-р анги", "12": "12-р анги"
};

const GRADES_LIST = Object.entries(GRADES_MAP).map(([id, name]) => ({ id, name }));

interface PendingSubject {
    tempId: string;
    name: string;
    gradeId: string;
}

export default function AdminSubjectsPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [newName, setNewName] = useState("");
    const [selectedGradeId, setSelectedGradeId] = useState("1");
    const [filterGradeId, setFilterGradeId] = useState("all");

    // CSV Bulk Upload State
    const [pendingSubjects, setPendingSubjects] = useState<PendingSubject[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const sData = await SettingsService.getSubjects();
            setSubjects(sData);
        } catch (error) {
            console.error("Load subjects error:", error);
            toast.error("Өгөгдлийг ачаалахад алдаа гарлаа");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !selectedGradeId) {
            toast.error("Сэдвийн нэр болон ангийг заавал сонгоно уу");
            return;
        }
        try {
            await SettingsService.createSubject(newName, selectedGradeId);
            setNewName("");
            loadData();
            toast.success("Сэдэв амжилттай нэмэгдлээ");
        } catch (error) {
            toast.error("Алдаа гарлаа");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Та устгахдаа итгэлтэй байна уу?")) return;
        try {
            await SettingsService.deleteSubject(id);
            setSubjects(prev => prev.filter(s => s.id !== id));
            toast.success("Устгагдлаа");
        } catch (error) {
            toast.error("Устгахад алдаа гарлаа");
        }
    };

    // CSV Logic
    const downloadTemplate = () => {
        const headers = "Сэдэв,Анги";
        const rows = "Жишээ сэдэв 1,1\nЖишээ сэдэв 2,5";
        const csvContent = "\uFEFF" + headers + "\n" + rows;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "subjects_template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split("\n").filter(line => line.trim());
            const newPending: PendingSubject[] = [];

            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const [name, gradeId] = lines[i].split(",").map(s => s.trim());
                if (name && gradeId) {
                    newPending.push({
                        tempId: Math.random().toString(36).substr(2, 9),
                        name,
                        gradeId
                    });
                }
            }
            setPendingSubjects(prev => [...prev, ...newPending]);
            if (fileInputRef.current) fileInputRef.current.value = "";
        };
        reader.readAsText(file);
    };

    const updatePending = (tempId: string, field: keyof PendingSubject, value: string) => {
        setPendingSubjects(prev => prev.map(s =>
            s.tempId === tempId ? { ...s, [field]: value } : s
        ));
    };

    const removePending = (tempId: string) => {
        setPendingSubjects(prev => prev.filter(s => s.tempId !== tempId));
    };

    const handleBulkSave = async () => {
        if (pendingSubjects.length === 0) return;
        setSaving(true);
        try {
            const toSave = pendingSubjects.map(s => ({ name: s.name, gradeId: s.gradeId }));
            await SettingsService.createSubjectsBatch(toSave);

            toast.success(`${pendingSubjects.length} сэдэв амжилттай хадгалагдлаа`);
            setPendingSubjects([]);
            loadData();
        } catch (error) {
            toast.error("Бөөнөөр хадгалахад алдаа гарлаа");
        } finally {
            setSaving(false);
        }
    };

    const displaySubjects = filterGradeId === "all"
        ? subjects
        : subjects.filter(s => s.gradeId === filterGradeId);

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-10">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin">
                        <button className="p-2 hover:bg-slate-100 rounded-full">
                            <ArrowLeft className="w-5 h-5 text-slate-600" />
                        </button>
                    </Link>
                    <h1 className="text-3xl font-bold text-slate-900">Сэдвүүд удирдах</h1>
                </div>
                <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                    <Download className="w-4 h-4" />
                    Загвар татах
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Single Create Form */}
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Шинэ сэдэв нэмэх</CardTitle></CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1 block">Сэдвийн нэр</label>
                                    <Input
                                        placeholder="Жишээ: Логарифм"
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1 block">Анги</label>
                                    <Select
                                        value={selectedGradeId}
                                        onChange={e => setSelectedGradeId(e.target.value)}
                                        required
                                    >
                                        {GRADES_LIST.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </Select>
                                </div>
                                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Сэдэв нэмэх
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card className="border-dashed border-2 bg-slate-50">
                        <CardContent className="pt-6">
                            <div className="text-center space-y-4">
                                <div className="p-3 bg-white rounded-full w-fit mx-auto shadow-sm">
                                    <Upload className="w-6 h-6 text-blue-600" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-slate-900">CSV-ээр бөөнөөр оруулах</p>
                                    <p className="text-xs text-slate-500">Загвар файлыг ашиглан олон сэдэв нэмэх</p>
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept=".csv"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Файл сонгох
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Bulk Preview or Main List */}
                <div className="lg:col-span-2 space-y-8">
                    {pendingSubjects.length > 0 && (
                        <Card className="border-blue-200 bg-blue-50/30 overflow-hidden">
                            <CardHeader className="bg-blue-50 border-b border-blue-100 flex flex-row items-center justify-between py-3">
                                <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
                                    <Save className="w-4 h-4" />
                                    Оруулахад бэлэн ({pendingSubjects.length})
                                </CardTitle>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => setPendingSubjects([])}>
                                        Болих
                                    </Button>
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleBulkSave} disabled={saving}>
                                        {saving ? "Хадгалж байна..." : "Бүгдийг хадгалах"}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 max-h-[400px] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 text-slate-600 font-bold">
                                        <tr>
                                            <th className="px-4 py-2 border-b">Сэдвийн нэр</th>
                                            <th className="px-4 py-2 border-b w-32">Анги</th>
                                            <th className="px-4 py-2 border-b w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 italic">
                                        {pendingSubjects.map((s) => (
                                            <tr key={s.tempId} className="bg-white hover:bg-slate-50">
                                                <td className="px-4 py-2">
                                                    <input
                                                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-slate-800 font-medium"
                                                        value={s.name}
                                                        onChange={(e) => updatePending(s.tempId, 'name', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-4 py-2 border-l">
                                                    <select
                                                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-slate-600"
                                                        value={s.gradeId}
                                                        onChange={(e) => updatePending(s.tempId, 'gradeId', e.target.value)}
                                                    >
                                                        {GRADES_LIST.map(g => (
                                                            <option key={g.id} value={g.id}>{g.id}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <button onClick={() => removePending(s.tempId)} className="text-slate-400 hover:text-red-600">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Бүртгэлтэй сэдвүүд</CardTitle>
                                <div className="w-40">
                                    <Select
                                        value={filterGradeId}
                                        onChange={e => setFilterGradeId(e.target.value)}
                                        className="text-xs"
                                    >
                                        <option value="all">Бүх анги</option>
                                        {GRADES_LIST.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="divide-y divide-slate-100">
                                {loading ? (
                                    <div className="py-8 text-center text-slate-500">Ачаалж байна...</div>
                                ) : displaySubjects.length === 0 ? (
                                    <div className="py-8 text-center text-slate-500 italic">Сэдэв олдсонгүй</div>
                                ) : (
                                    displaySubjects.map((s) => (
                                        <div key={s.id} className="py-3 flex justify-between items-center group">
                                            <div>
                                                <div className="font-semibold text-slate-900">{s.name}</div>
                                                <div className="text-[10px] inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-600 mt-1 uppercase font-bold tracking-tight">
                                                    {GRADES_MAP[s.gradeId || ""] || "Бүгд"}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDelete(s.id)}
                                                className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
