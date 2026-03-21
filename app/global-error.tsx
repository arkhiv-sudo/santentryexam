"use client";

import { useEffect } from "react";
import { ErrorLoggingService } from "@/lib/services/error-service";
import { Button } from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to our service
        ErrorLoggingService.logError(error, { digest: error.digest, type: "global_error" });
    }, [error]);

    return (
        <html lang="mn">
            <body>
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="w-8 h-8" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 mb-3">Системд ноцтой алдаа гарлаа</h1>
                        <p className="text-slate-500 mb-8 text-sm leading-relaxed">
                            Уучлаарай, системд урьдчилан тооцоолоогүй ноцтой алдаа гарлаа. Бид алдааны мэдээллийг хүлээж авсан бөгөөд удахгүй засах болно.
                        </p>
                        <Button 
                            onClick={() => reset()}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-6 rounded-xl text-lg transition-colors"
                        >
                            Дахин оролдох
                        </Button>
                        <p className="mt-6 text-xs text-slate-400">
                            Алдааны код: {error.digest || "Тодорхойгүй"}
                        </p>
                    </div>
                </div>
            </body>
        </html>
    );
}
