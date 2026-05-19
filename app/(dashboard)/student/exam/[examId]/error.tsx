"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ExamError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error("[Exam error]", error); }, [error]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl p-8 text-center border border-red-100">
        <div className="w-20 h-20 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-3">Шалгалт ачаалахад алдаа гарлаа</h1>
        <p className="text-sm text-slate-600 mb-2">
          Сэтгэл санаагаа барих хэрэггүй. Таны хариултууд автоматаар хадгалагдсан байна.
        </p>
        <p className="text-xs text-red-700 bg-red-50 p-3 rounded-lg my-4 text-left">
          <strong>Алдааны мэдээлэл:</strong> {error?.message?.slice(0, 200) || "Тодорхойгүй алдаа"}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
          <button onClick={() => reset()} className="inline-flex items-center justify-center gap-1.5 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700">
            <RefreshCw className="w-4 h-4" /> Шалгалтад буцаж орох
          </button>
          <button onClick={() => router.push("/student")} className="inline-flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 px-5 py-3 rounded-xl font-bold hover:bg-slate-200">
            Гарах
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-4">
          Хэрэв асуудал давтагдсаар байвал админд хандана уу.
        </p>
      </div>
    </div>
  );
}
