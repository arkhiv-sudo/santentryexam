"use client";

import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-8xl font-black text-slate-200 mb-2">404</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Хуудас олдсонгүй</h1>
        <p className="text-sm text-slate-600 mb-6">
          Таны хайсан хуудас байхгүй эсвэл устгагдсан байна.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700">
          <Home className="w-4 h-4" /> Нүүр хуудас руу буцах
        </Link>
      </div>
    </div>
  );
}
