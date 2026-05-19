"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error("[Dashboard error]", error); }, [error]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-red-100">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-xl font-black text-slate-900 mb-2">Хуудас ачаалахад алдаа гарлаа</h1>
        <p className="text-sm text-slate-600 mb-1">{error?.message?.slice(0, 200) || "Тодорхойгүй алдаа"}</p>
        {error?.digest && <p className="text-xs text-slate-400 mb-4">Код: {error.digest}</p>}
        <div className="flex gap-2 justify-center mt-6">
          <button onClick={() => reset()} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700">
            <RefreshCw className="w-4 h-4" /> Дахин оролдох
          </button>
          <button onClick={() => router.push("/")} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-200">
            <Home className="w-4 h-4" /> Нүүр хуудас
          </button>
        </div>
      </div>
    </div>
  );
}
