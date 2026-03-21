"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
    doc, setDoc, updateDoc, arrayUnion,
    collection, query, where, getDocs, serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import { GraduationCap, Plus, Copy, Eye, EyeOff, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { UserProfile } from "@/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateStudentCode(): string {
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    return "STU" + digits;
}

function generateTempPassword(): string {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChildResult {
    name: string;
    studentCode: string;
    tempPassword: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChildrenPage() {
    const { profile, user } = useAuth();
    const [loading, setLoading] = useState(false);

    // Form fields
    const [lastName, setLastName] = useState("");
    const [firstName, setFirstName] = useState("");
    const [phone, setPhone] = useState("");
    const [school, setSchool] = useState("");
    const [className, setClassName] = useState("");
    const [nationalId, setNationalId] = useState("");

    // Added children result display
    const [addedChildren, setAddedChildren] = useState<ChildResult[]>([]);
    const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});

    const handleAddChild = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !profile) return;
        setLoading(true);

        try {
            // 1. Check for duplicate nationalId
            const nationalIdTrimmed = nationalId.trim().toUpperCase();
            if (nationalIdTrimmed) {
                const dupQ = query(
                    collection(db, "users"),
                    where("nationalId", "==", nationalIdTrimmed)
                );
                const dupSnap = await getDocs(dupQ);
                if (!dupSnap.empty) {
                    toast.error("Энэ РД-тай сурагч аль хэдийн бүртгэгдсэн байна.");
                    setLoading(false);
                    return;
                }
            }

            // 2. Generate credentials
            const studentCode = generateStudentCode();
            const tempPassword = generateTempPassword();
            const studentEmail = `${studentCode}@student.internal`;
            const grade = className.trim().match(/\d+/)?.[0] || "";

            // 3. Create Firebase Auth account for the student
            const childCredential = await createUserWithEmailAndPassword(auth, studentEmail, tempPassword);
            const childUid = childCredential.user.uid;

            // 4. Create Firestore user document for student
            const childProfile: UserProfile & Record<string, unknown> = {
                uid: childUid,
                email: studentEmail,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                role: "student",
                studentCode,
                tempPassword,
                phone: phone.trim(),
                school: school.trim(),
                class: className.trim(),
                grade,
                nationalId: nationalIdTrimmed,
                parentId: user.uid,
                children: [],
                createdAt: serverTimestamp() as unknown as Date,
            };

            await setDoc(doc(db, "users", childUid), childProfile);

            // 5. Add child UID to parent's children array
            await updateDoc(doc(db, "users", user.uid), {
                children: arrayUnion(childUid),
            });

            // 6. Re-sign in with parent (creating child account signs in as child)
            // We use parent's own token refresh to stay signed in as parent
            // NOTE: Firebase Web SDK — createUserWithEmailAndPassword switches current user.
            // We need to re-sign in the parent. The parent session cookie was already set, so
            // just sign the parent back in silently by refreshing their ID token via the server.
            await fetch("/api/auth/refresh", { method: "POST" }).catch(() => null);

            // 7. Show success
            setAddedChildren((prev) => [
                ...prev,
                {
                    name: `${lastName.trim()} ${firstName.trim()}`,
                    studentCode,
                    tempPassword,
                },
            ]);
            toast.success(`${firstName.trim()} амжилттай бүртгэгдлээ!`);

            // 8. Reset form
            setLastName("");
            setFirstName("");
            setPhone("");
            setSchool("");
            setClassName("");
            setNationalId("");
        } catch (err: unknown) {
            const e = err as { code?: string; message?: string };
            const msg = e.code === "auth/email-already-in-use"
                ? "Энэ сурагчийн код аль хэдийн ашиглагдсан байна. Дахин оролдоно уу."
                : e.message || "Хүүхэд нэмэхэд алдаа гарлаа.";
            toast.error(msg);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text).then(() => toast.success("Хуулагдлаа!"));
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-16">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/parent">
                    <Button variant="ghost" size="sm">← Буцах</Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Хүүхэд нэмэх</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Хүүхдийн бүртгэл үүсгэж шалгалтанд оролцуулна уу</p>
                </div>
            </div>

            {/* Add child form */}
            <Card className="border-0 shadow-xl rounded-3xl overflow-hidden">
                <CardHeader className="bg-linear-to-r from-violet-600 to-indigo-600 text-white p-6">
                    <CardTitle className="flex items-center gap-3 text-xl">
                        <GraduationCap className="w-6 h-6" />
                        Хүүхдийн мэдээлэл оруулна уу
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <form onSubmit={handleAddChild} className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Овог</label>
                                <Input
                                    placeholder="Хүүхдийн овог"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    required
                                    className="h-11 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Нэр</label>
                                <Input
                                    placeholder="Хүүхдийн нэр"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                    className="h-11 rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">РД (Регистрийн дугаар)</label>
                            <Input
                                placeholder="Жишээ: УА00112233"
                                value={nationalId}
                                onChange={(e) => setNationalId(e.target.value)}
                                required
                                className="h-11 rounded-xl"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Утасны дугаар</label>
                            <Input
                                type="tel"
                                placeholder="99xxxxxx"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="h-11 rounded-xl"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Сургууль</label>
                                <Input
                                    placeholder="Сургуулийн нэр"
                                    value={school}
                                    onChange={(e) => setSchool(e.target.value)}
                                    required
                                    className="h-11 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Анги</label>
                                <Input
                                    placeholder="Жишээ: 12А"
                                    value={className}
                                    onChange={(e) => setClassName(e.target.value)}
                                    required
                                    className="h-11 rounded-xl"
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-13 bg-violet-600 hover:bg-violet-700 text-white font-bold text-lg rounded-2xl shadow-lg flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                            {loading ? "Бүртгэж байна..." : "Хүүхэд нэмэх"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Added children credentials */}
            {addedChildren.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-emerald-600" />
                        Нэмэгдсэн хүүхдүүдийн нэвтрэх мэдээлэл
                    </h2>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 font-medium">
                        ⚠️ Энэхүү мэдээллийг хадгалж аваарай. Сурагч зөвхөн энэ кодоор нэвтэрнэ.
                    </div>
                    {addedChildren.map((child, idx) => (
                        <Card key={idx} className="border-0 shadow-md rounded-2xl overflow-hidden">
                            <div className="bg-emerald-600 p-4 text-white">
                                <p className="font-black text-lg">{child.name}</p>
                            </div>
                            <CardContent className="p-5 space-y-3">
                                <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Нэвтрэх код</p>
                                        <p className="text-2xl font-black text-slate-900 tracking-widest font-mono">{child.studentCode}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => copyText(child.studentCode)}>
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Нууц үг</p>
                                        <p className="text-xl font-black text-slate-900 font-mono">
                                            {showPasswords[idx] ? child.tempPassword : "••••••••"}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowPasswords((p) => ({ ...p, [idx]: !p[idx] }))}
                                        >
                                            {showPasswords[idx] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => copyText(child.tempPassword)}>
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
