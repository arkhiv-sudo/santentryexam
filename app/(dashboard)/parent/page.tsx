"use client";

import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export default function ParentDashboard() {
    const { profile } = useAuth();

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Эцэг эхийн хянах самбар</h1>
            <p className="text-gray-500">Тавтай морил, {profile?.lastName} {profile?.firstName}</p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Миний хүүхдүүд</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-500">
                            {profile?.children?.length
                                ? `Танд ${profile.children.length} сурагч холбогдсон байна.`
                                : "Одоогоор сурагч холбогдоогүй байна."}
                        </p>
                        {/* List children here */}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Сүүлийн үеийн дүнгүүд</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-500">Хүүхдүүдийнхээ шалгалтын дүнг харах.</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
