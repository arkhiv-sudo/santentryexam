"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { checkPasswordStrength } from "@/lib/password-policy";

export default function ChangePasswordPage() {
    const { user, profile } = useAuth();
    const router = useRouter();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !user.email) return;
        // FIX 34: Run the shared policy so all new passwords (signup, change, child reset)
        // meet the same minimum bar instead of relying on a per-page length check.
        const pwCheck = checkPasswordStrength(newPassword);
        if (!pwCheck.ok) { toast.error(pwCheck.errors.join(", ")); return; }
        if (newPassword !== confirm) { toast.error("Нууц үг таарахгүй байна"); return; }
        setLoading(true);
        try {
            const cred = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, cred);
            await updatePassword(user, newPassword);
            await updateDoc(doc(db, "users", user.uid), { mustChangePassword: false });
            toast.success("Нууц үг амжилттай солигдлоо");
            router.push(`/${profile?.role || ""}`);
        } catch (err: unknown) {
            console.error("[changePassword.handleSubmit]", err);
            toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="max-w-md mx-auto p-6 space-y-4">
            <h1 className="text-2xl font-bold">Нууц үгээ солих</h1>
            <p className="text-amber-700 bg-amber-50 p-3 rounded">Та анхны нэвтрэлт хийсэн тул нууц үгээ заавал солих хэрэгтэй.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
                <input type="password" placeholder="Одоогийн нууц үг" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className="w-full p-3 border rounded" />
                <input type="password" placeholder="Шинэ нууц үг" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="w-full p-3 border rounded" />
                <input type="password" placeholder="Шинэ нууц үг давтах" value={confirm} onChange={e => setConfirm(e.target.value)} required className="w-full p-3 border rounded" />
                <button type="submit" disabled={loading} className="w-full p-3 bg-blue-600 text-white rounded">{loading ? "Солиж байна..." : "Солих"}</button>
            </form>
        </div>
    );
}
