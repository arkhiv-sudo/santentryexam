"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GraduationCap, LogIn, Loader2 } from "lucide-react";

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user && profile) {
      // Redirect to role-specific dashboard
      if (profile.role === 'admin') router.push('/admin');
      else if (profile.role === 'teacher') router.push('/teacher');
      else if (profile.role === 'parent') router.push('/parent');
      else if (profile.role === 'student') router.push('/student');
      else router.push('/login');
    }
  }, [user, profile, loading, router]);

  if (loading || (user && profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
        <header className="bg-white border-b border-slate-200 py-4 shadow-sm">
            <div className="max-w-4xl mx-auto px-4 md:px-8 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-lg">
                        S
                    </div>
                    <span className="text-xl font-bold text-slate-800 tracking-tight">Шалгалтын Систем</span>
                </div>
            </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-4 py-12">
            <div className="w-full max-w-md">
                <Card className="shadow-2xl border-0 overflow-hidden rounded-2xl">
                    <div className="bg-linear-to-r from-blue-600 to-indigo-600 p-8 text-center text-white relative">
                        <div className="absolute top-0 inset-x-0 h-full bg-white/5 opacity-20"></div>
                        <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl mx-auto flex items-center justify-center mb-4 relative z-10 shadow-lg">
                            <GraduationCap className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-black relative z-10">Тавтай морилно уу</h1>
                        <p className="text-blue-100 font-medium mt-2 relative z-10">Та хэрхэн шалгалт өгөхийг хүсэж байна вэ?</p>
                    </div>
                    
                    <CardContent className="p-8 space-y-4">
                        <Button 
                            onClick={() => router.push('/s')}
                            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-xl shadow-md gap-2"
                        >
                            <GraduationCap className="w-5 h-5" /> Шууд шалгалт өгөх
                        </Button>
                        
                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-200" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-slate-400 font-bold tracking-widest">ЭСВЭЛ</span>
                            </div>
                        </div>

                        <Button 
                            onClick={() => router.push('/login')}
                            variant="outline"
                            className="w-full h-14 border-2 border-slate-200 hover:border-blue-600 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-lg rounded-xl transition-all gap-2"
                        >
                            <LogIn className="w-5 h-5" /> Систем рүү нэвтрэх
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </main>
    </div>
  );
}
