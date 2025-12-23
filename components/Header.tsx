"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Users, FileQuestion, ClipboardList, BookOpen, GraduationCap } from "lucide-react";
import { useState } from "react";

export default function Header() {
    const { profile } = useAuth();
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleLogout = async () => {
        try {
            // Call server-side logout API to clear cookies
            await fetch('/api/auth/logout', {
                method: 'POST',
            });

            // Sign out from Firebase
            await signOut(auth);

            // Force redirect to login
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout error:', error);
            // Even if there's an error, redirect to login
            window.location.href = '/login';
        }
    };

    const roleLabels: Record<string, string> = {
        admin: "Админ",
        teacher: "Багш",
        student: "Сурагч",
        parent: "Эцэг эх"
    };

    // Role-based menu items
    const getMenuItems = () => {
        if (profile?.role === 'admin') {
            return [
                { label: "Хянах самбар", href: "/admin", icon: ClipboardList },
                { label: "Хэрэглэгчид", href: "/admin/users", icon: Users },
                { label: "Асуултын сан", href: "/admin/questions", icon: FileQuestion },
                { label: "Шалгалтууд", href: "/admin/exams", icon: BookOpen },
            ];
        }
        if (profile?.role === 'teacher') {
            return [
                { label: "Хянах самбар", href: "/teacher", icon: ClipboardList },
                { label: "Миний шалгалтууд", href: "/teacher/exams", icon: BookOpen },
                { label: "Шалгалт үүсгэх", href: "/teacher/exams/create", icon: FileQuestion },
            ];
        }
        if (profile?.role === 'student') {
            return [
                { label: "Хянах самбар", href: "/student", icon: ClipboardList },
                { label: "Миний шалгалтууд", href: "/student/exams", icon: BookOpen },
            ];
        }
        if (profile?.role === 'parent') {
            return [
                { label: "Хянах самбар", href: "/parent", icon: ClipboardList },
            ];
        }
        return [];
    };

    const menuItems = getMenuItems();

    return (
        <nav className="bg-white shadow-sm border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="text-xl font-bold text-slate-900 hover:text-blue-600 transition-colors">
                            Шалгалтын систем
                        </Link>

                        {/* Navigation Menu */}
                        {menuItems.length > 0 && (
                            <div className="hidden md:flex items-center gap-1">
                                {menuItems.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <Link key={item.href} href={item.href}>
                                            <button className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                                                <Icon className="w-4 h-4" />
                                                {item.label}
                                            </button>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}

                        {/* Mobile Menu Button */}
                        {menuItems.length > 0 && (
                            <div className="md:hidden relative">
                                <button
                                    onClick={() => setMenuOpen(!menuOpen)}
                                    className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                >
                                    Цэс
                                    <ChevronDown className={`w-4 h-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {menuOpen && (
                                    <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-50">
                                        {menuItems.map((item) => {
                                            const Icon = item.icon;
                                            return (
                                                <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                                                    <div className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                                                        <Icon className="w-4 h-4" />
                                                        {item.label}
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {profile && (
                            <div className="hidden sm:flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-600">
                                    {profile.lastName} {profile.firstName}
                                </span>
                                <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full uppercase tracking-wide">
                                    {roleLabels[profile.role] || profile.role}
                                </span>
                            </div>
                        )}
                        <Button variant="outline" size="sm" onClick={handleLogout} className="hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors">
                            Гарах
                        </Button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
