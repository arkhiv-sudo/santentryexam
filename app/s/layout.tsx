import { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

export default function StudentPortalLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="bg-white border-b border-slate-200 py-4 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 md:px-8 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Logo size={34} />
                        <span className="text-xl font-bold text-slate-800 tracking-tight">Шалгалтын Систем</span>
                    </div>
                </div>
            </header>
            
            <main className="flex-1 flex flex-col">
                {children}
            </main>

            <footer className="bg-white border-t border-slate-200 py-6 text-center text-slate-500 text-sm">
                <p>&copy; {new Date().getFullYear()} Шалгалтын Систем. Бүх эрх хуулиар хамгаалагдсан.</p>
            </footer>
        </div>
    );
}
