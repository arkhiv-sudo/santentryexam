"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { UserProfile, UserRole } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AdminUsersPage() {
    const { profile, loading: authLoading } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    const fetchUsers = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            const usersData = querySnapshot.docs.map((doc) => doc.data() as UserProfile);
            setUsers(usersData);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (profile?.role === "admin") {
            fetchUsers();
        }
    }, [profile]);

    const handleRoleUpdate = async (uid: string, newRole: UserRole) => {
        try {
            const token = await auth.currentUser?.getIdToken();
            const res = await fetch("/api/admin/set-role", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ uid, role: newRole }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to update role");
            }

            // Also update Firestore for consistency/UI (optional but good for sync)
            await updateDoc(doc(db, "users", uid), { role: newRole });

            setUsers(users.map(u => u.uid === uid ? { ...u, role: newRole } : u));
            toast.success("Эрх амжилттай шинэчлэгдлээ");
        } catch (error: any) {
            console.error("Error updating role:", error);
            toast.error(error.message || "Эрх шинэчлэхэд алдаа гарлаа");
        }
    };

    const roleLabels: Record<UserRole, string> = {
        admin: "Админ",
        teacher: "Багш",
        student: "Сурагч",
        parent: "Эцэг эх"
    };

    if (authLoading || loading) return <div className="p-8 text-center">Уншиж байна...</div>;

    return (
        <div className="space-y-6">
            {/* Subtle Header */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-50 to-blue-50 p-6 border border-slate-200">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Хэрэглэгчийн удирдлага</h1>
                    <p className="text-slate-600 mt-1">Бүх хэрэглэгчдийг харах, засах, эрх өөрчлөх</p>
                </div>
            </div>

            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle>Бүх хэрэглэгчид</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">Овог</th>
                                    <th className="px-6 py-3">Нэр</th>
                                    <th className="px-6 py-3">Имэйл / Код</th>
                                    <th className="px-6 py-3">Эрх</th>
                                    <th className="px-6 py-3">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.uid} className="bg-white border-b">
                                        <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{user.lastName}</td>
                                        <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{user.firstName}</td>
                                        <td className="px-6 py-4">
                                            {user.email}
                                            {user.studentCode && (
                                                <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-bold">
                                                    {user.studentCode}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold
                                            ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                                    user.role === 'teacher' ? 'bg-green-100 text-green-800' :
                                                        user.role === 'student' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {roleLabels[user.role] || user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Select
                                                value={user.role}
                                                onChange={(e) => handleRoleUpdate(user.uid, e.target.value as UserRole)}
                                                className="min-w-[140px]"
                                            >
                                                <option value="student">Сурагч</option>
                                                <option value="teacher">Багш</option>
                                                <option value="parent">Эцэг эх</option>
                                                <option value="admin">Админ</option>
                                            </Select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
