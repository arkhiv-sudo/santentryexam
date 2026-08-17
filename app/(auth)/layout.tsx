import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2.5 mb-8">
                <Logo size={44} />
                <span className="text-2xl font-bold text-slate-800 tracking-tight">Шалгалтын Систем</span>
            </Link>
            <div className="w-full h-full flex items-center justify-center">
                {children}
            </div>
        </div>
    );
}
