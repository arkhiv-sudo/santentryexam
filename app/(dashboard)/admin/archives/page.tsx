"use client";

import { useState, useEffect } from "react";
import { ArchiveService } from "@/lib/services/archive-service";
import { Card, CardContent } from "@/components/ui/Card";
import { Archive, Trash2, Calendar, ClipboardList } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/ModalProvider";

export default function ArchivesPage() {
    const router = useRouter();
    const confirm = useConfirm();
    const { profile, loading: authLoading } = useAuth();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [archives, setArchives] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchArchives = async () => {
        try {
            const data = await ArchiveService.getArchivedExams();
            setArchives(data);
        } catch (error) {
            console.error("Failed to load archives:", error);
            toast.error("Архив уншихад алдаа гарлаа");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        } else if (profile?.role === "admin") {
            fetchArchives();
        }
    }, [profile, authLoading, router]);

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: "Архив устгах",
            message: "Та энэ архивыг устгахдаа итгэлтэй байна уу? Устгасны дараа сэргээх боломжгүй бөгөөд бүх түүх устана.",
            confirmLabel: "Устгах",
            variant: "destructive"
        });

        if (!confirmed) return;
        try {
            await ArchiveService.deleteArchive(id);
            toast.success("Архив амжилттай устгагдлаа");
            fetchArchives();
        } catch (error) {
            console.error(error);
            toast.error("Архив устгах үед алдаа гарлаа");
        }
    };

    if (authLoading || loading) return <div className="p-8 text-center">Уншиж байна...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-linear-to-r from-rose-50 to-red-50/50 px-6 py-5 rounded-xl border border-red-100 shadow-sm relative overflow-hidden mb-6">
                <div className="relative z-10 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-white p-2.5 rounded-lg shadow-sm">
                            <Archive className="w-6 h-6 text-rose-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Архив</h1>
                            <p className="text-slate-500 mt-1 text-sm">Архивлагдсан шалгалтууд болон түүх</p>
                        </div>
                    </div>
                </div>
                <div className="absolute right-0 top-0 w-64 h-64 bg-rose-100/50 rounded-full blur-3xl -mr-32 -mt-32"></div>
            </div>

            <Card className="bg-white shadow-xl border-0 overflow-hidden">
                <CardContent className="p-0">
                    <div className="border-t border-gray-100">
                        {archives.length === 0 ? (
                            <div className="py-16 text-center flex flex-col items-center">
                                <Archive className="w-12 h-12 text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold text-slate-500">Архив хоосон байна</h3>
                                <p className="text-slate-400 mt-2 max-w-sm">
                                    Одоогоор архивласан шалгалт байхгүй байна. Шалгалтын жагсаалтаас &quot;Архивлах&quot; үйлдлийг сонгосноор энд орж ирнэ.
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4">Шалгалт</th>
                                        <th className="px-6 py-4 text-center">Архивласан</th>
                                        <th className="px-6 py-4 text-center">Оролцогч</th>
                                        <th className="px-6 py-4 text-right">Үйлдэл</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {archives.map((archive) => {
                                        const dt = archive.archivedAt?.toDate ? archive.archivedAt.toDate() : new Date(archive.archivedAt);
                                        return (
                                            <tr key={archive.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-900">{archive.exam?.title || "Нэргүй шалгалт"}</div>
                                                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                                                        <span className="bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                            {archive.exam?.grade}-р анги
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            {archive.exam?.scheduledAt ? new Date(archive.exam.scheduledAt.seconds * 1000).toLocaleDateString() : ""}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center text-slate-500">
                                                    {dt.toLocaleDateString()} {dt.toLocaleTimeString()}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                                                        <ClipboardList className="w-3.5 h-3.5" />
                                                        {archive.submissions?.length || 0}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <button
                                                            onClick={() => handleDelete(archive.id)}
                                                            className="text-red-500 hover:text-red-800 font-medium text-xs transition-colors p-2 bg-red-50 rounded-lg hover:bg-red-100"
                                                            title="Устгах"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
