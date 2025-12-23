"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Settings, Database, Bell, Shield, Mail, Globe } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
        }
    }, [profile, authLoading, router]);

    if (authLoading) return <div className="p-8 text-center">Уншиж байна...</div>;

    const handleSave = async () => {
        setSaving(true);
        // TODO: Implement settings save logic
        setTimeout(() => {
            setSaving(false);
            toast.success("Тохиргоо хадгалагдлаа");
        }, 1000);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-50 to-blue-50 p-6 border border-slate-200">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Системийн тохиргоо</h1>
                    <p className="text-slate-600 mt-1">Ерөнхий тохиргоо болон параметрүүд</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* General Settings */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Settings className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <CardTitle>Ерөнхий тохиргоо</CardTitle>
                                <CardDescription>Системийн үндсэн параметрүүд</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Системийн нэр</label>
                            <Input defaultValue="Шалгалтын систем" />
                        </div>
                        <div>
                            <Select label="Үндсэн хэл" defaultValue="mn">
                                <option value="mn">Монгол</option>
                                <option value="en">English</option>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Database Settings */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                <Database className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <CardTitle>Өгөгдлийн сан</CardTitle>
                                <CardDescription>Firebase тохиргоо</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                            <p className="text-sm font-medium text-green-900">Холболт амжилттай</p>
                            <p className="text-xs text-green-700 mt-1">Firebase Firestore</p>
                        </div>
                        <div className="text-sm text-slate-600">
                            <p>Project ID: <span className="font-mono text-slate-900">santentryexam</span></p>
                        </div>
                    </CardContent>
                </Card>

                {/* Notification Settings */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                <Bell className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <CardTitle>Мэдэгдэл</CardTitle>
                                <CardDescription>Мэдэгдлийн тохиргоо</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                            <span className="text-sm text-slate-700">Имэйл мэдэгдэл идэвхжүүлэх</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                            <span className="text-sm text-slate-700">Шинэ хэрэглэгчийн мэдэгдэл</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" />
                            <span className="text-sm text-slate-700">Шалгалтын мэдэгдэл</span>
                        </label>
                    </CardContent>
                </Card>

                {/* Security Settings */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                                <Shield className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <CardTitle>Аюулгүй байдал</CardTitle>
                                <CardDescription>Нууцлал болон эрхийн тохиргоо</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                            <span className="text-sm text-slate-700">Хоёр үе шаттай баталгаажуулалт</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                            <span className="text-sm text-slate-700">Нууц үг сэргээх имэйл</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                            <span className="text-sm text-slate-700">Нэвтрэх түүх хадгалах</span>
                        </label>
                    </CardContent>
                </Card>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                    {saving ? "Хадгалж байна..." : "Тохиргоо хадгалах"}
                </Button>
            </div>
        </div>
    );
}
