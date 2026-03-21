"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RetakeService, RetakeRequest } from "@/lib/services/retake-service";
import { Card, CardContent } from "@/components/ui/Card";
import { Check, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/ModalProvider";

export default function AdminRetakeRequestsPage() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const confirm = useConfirm();

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ["admin_retake_requests"],
        queryFn: RetakeService.getAllRequests,
        staleTime: 5 * 60 * 1000,
    });

    const approveMutation = useMutation({
        mutationFn: (req: RetakeRequest) => RetakeService.approveRequest(req.id, req.studentId, req.examId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin_retake_requests"] });
            toast.success("Хүсэлтийг зөвшөөрлөө. Сурагч дахин шалгалт өгөх боломжтой боллоо.");
        },
        onError: () => toast.error("Зөвшөөрөхөд алдаа гарлаа")
    });

    const rejectMutation = useMutation({
        mutationFn: (id: string) => RetakeService.rejectRequest(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin_retake_requests"] });
            toast.success("Хүсэлтээс татгалзлаа");
        },
        onError: () => toast.error("Татгалзахад алдаа гарлаа")
    });

    const handleApprove = async (req: RetakeRequest) => {
        const confirmed = await confirm({
            title: "Хүсэлт зөвшөөрөх",
            message: `Та ${req.studentName} сурагчийн ${req.examTitle} шалгалтыг дахин өгөх хүсэлтийг зөвшөөрөхдөө итгэлтэй байна уу? Өмнөх шалгалтын дүн устгагдах болно.`,
            confirmLabel: "Зөвшөөрөх",
        });
        if (confirmed) approveMutation.mutate(req);
    };

    const handleReject = async (id: string) => {
        const confirmed = await confirm({
            title: "Хүсэлт татгалзах",
            message: "Та энэ хүсэлтээс татгалзахдаа итгэлтэй байна уу?",
            confirmLabel: "Татгалзах",
            variant: "destructive"
        });
        if (confirmed) rejectMutation.mutate(id);
    };

    if (authLoading || isLoading) return <div className="p-8 text-center text-slate-500">Уншиж байна...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-linear-to-r from-amber-50 to-orange-50/50 px-6 py-5 rounded-xl border border-amber-100 shadow-sm relative overflow-hidden mb-6">
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <FileText className="w-5 h-5 text-amber-600" />
                            Дахин өгөх хүсэлтүүд
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">Сурагчдын илгээсэн шалгалт дахин өгөх хүсэлтүүд</p>
                    </div>
                </div>
            </div>

            <Card className="bg-white shadow-xl border-0">
                <CardContent className="p-0">
                    <div className="border-t border-gray-100 overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-900 font-semibold border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4">Огноо</th>
                                    <th className="px-6 py-4">Сурагч</th>
                                    <th className="px-6 py-4">Шалгалт</th>
                                    <th className="px-6 py-4">Шалтгаан</th>
                                    <th className="px-6 py-4 text-center">Төлөв</th>
                                    <th className="px-6 py-4 text-right">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {requests.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Одоогоор хүсэлт байхгүй байна.</td>
                                    </tr>
                                ) : (
                                    requests.map((req) => (
                                        <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 text-gray-500">
                                                {req.createdAt.toLocaleDateString()} {req.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                {req.studentName}
                                            </td>
                                            <td className="px-6 py-4 text-gray-700">
                                                {req.examTitle}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 max-w-xs truncate" title={req.reason}>
                                                {req.reason || "-"}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {req.status === "pending" ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                                                        Хүлээгдэж буй
                                                    </span>
                                                ) : req.status === "approved" ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                                                        Зөвшөөрсөн
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">
                                                        Татгалзсан
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {req.status === "pending" ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleApprove(req)}
                                                            disabled={approveMutation.isPending || rejectMutation.isPending}
                                                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                            title="Зөвшөөрөх"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(req.id)}
                                                            disabled={approveMutation.isPending || rejectMutation.isPending}
                                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Татгалзах"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">
                                                        Шийдвэрлэгдсэн
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
