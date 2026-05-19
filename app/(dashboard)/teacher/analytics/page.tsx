"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent } from "@/components/ui/Card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "sonner";

interface QuestionStat {
  id: string;
  content: string;
  attemptCount: number;
  correctCount: number;
  correctRate: number;
  subject?: string;
}

export default function TeacherAnalytics() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<QuestionStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const load = async () => {
      try {
        // Fetch questions created by this teacher with stats
        const q = query(
          collection(db, "questions"),
          where("createdBy", "==", user.uid),
          where("attemptCount", ">", 0),
          orderBy("attemptCount", "desc"),
          limit(100)
        );
        const snap = await getDocs(q);
        const items = snap.docs.map(d => {
          const data = d.data();
          const total = data.attemptCount || 0;
          const correct = data.correctCount || 0;
          return {
            id: d.id,
            content: String(data.content || '').slice(0, 100),
            attemptCount: total,
            correctCount: correct,
            correctRate: total > 0 ? (correct / total) : 0,
            subject: data.subject,
          };
        });
        setQuestions(items);
      } catch (err) {
        console.error('[teacher analytics]', err);
        toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.uid]);

  const hardest = [...questions].sort((a, b) => a.correctRate - b.correctRate).slice(0, 10);
  const easiest = [...questions].sort((a, b) => b.correctRate - a.correctRate).slice(0, 10);

  return (
    <ErrorBoundary label="Аналитик ачаалахад алдаа">
      <div className="space-y-6">
        <h1 className="text-2xl font-black">Асуултын аналитик</h1>
        <p className="text-sm text-slate-600">
          Танай зохиосон асуултуудын зөв хариулсан хувь, давтамж
        </p>
        {loading ? (
          <div className="text-center py-12 text-slate-500">Уншиж байна...</div>
        ) : questions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              Аналитик мэдээлэл одоогоор алга. Сурагчид таны асуултанд хариулсаны дараа энд харагдана.
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6">
                <h2 className="font-bold mb-3 text-red-700">Хамгийн хэцүү 10</h2>
                <div className="space-y-2">
                  {hardest.map(q => (
                    <div key={q.id} className="border-b pb-2">
                      <div className="text-xs truncate">{q.content}</div>
                      <div className="text-xs text-slate-500">
                        {(q.correctRate * 100).toFixed(0)}% зөв • {q.attemptCount} оролдлого
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h2 className="font-bold mb-3 text-green-700">Хамгийн амархан 10</h2>
                <div className="space-y-2">
                  {easiest.map(q => (
                    <div key={q.id} className="border-b pb-2">
                      <div className="text-xs truncate">{q.content}</div>
                      <div className="text-xs text-slate-500">
                        {(q.correctRate * 100).toFixed(0)}% зөв • {q.attemptCount} оролдлого
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
