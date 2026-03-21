"use client";

import { useEffect } from "react";
import { ErrorLoggingService } from "@/lib/services/error-service";
import { Button } from "@/components/ui/Button";
import { AlertCircle, RefreshCcw, Home } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function ErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const { profile } = useAuth(); // Safely access user profile if available

    useEffect(() => {
        // Log the error to our service
        ErrorLoggingService.logError(error, { digest: error.digest, type: "route_error" }, profile?.uid);
    }, [error, profile]);

    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-lg border border-slate-100 p-8 text-center overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>
                
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <AlertCircle className="w-10 h-10" />
                </div>
                
                <h1 className="text-2xl font-black text-slate-800 mb-3 tracking-wide">Алдаа гарлаа</h1>
                
                <p className="text-slate-500 mb-8 text-base leading-relaxed">
                    Үйлдэл хийх явцад саатал гарлаа. Энэхүү алдааны тухай мэдээлэл манай хөгжүүлэгчдэд давхар илгээгдсэн тул удахгүй засагдах болно.
                </p>
                
                <div className="flex flex-col gap-3">
                    <Button 
                        onClick={() => reset()}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-200"
                    >
                        <RefreshCcw className="w-5 h-5" />
                        Дахин ачааллах
                    </Button>
                    
                    <Link href="/">
                        <Button 
                            variant="outline"
                            className="w-full text-slate-600 border-slate-200 hover:bg-slate-50 font-semibold py-6 rounded-xl flex items-center justify-center gap-2 transition-all"
                        >
                            <Home className="w-5 h-5" />
                            Нүүр хуудас руу буцах
                        </Button>
                    </Link>
                </div>
                
                <p className="mt-8 text-xs font-mono text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-100 break-all">
                    {error.message || "Unknown error"}
                </p>
            </div>
        </div>
    );
}
