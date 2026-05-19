"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent } from "@/components/ui/Card";
import { toast } from "sonner";
import { toDate } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface AuditEntry {
  id: string;
  action: string;
  actorUid: string;
  targetUid?: string;
  targetResource?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Timestamp | Date | string;
}

const ACTION_LABELS: Record<string, string> = {
  set_role: 'Үүрэг өөрчилсөн',
  disable_user: 'Хэрэглэгч идэвхгүй болгосон',
  force_submit: 'Шалгалт хүчээр илгээсэн',
  exam_delete: 'Шалгалт устгасан',
  exam_archive: 'Шалгалт архивласан',
  retake_approve: 'Дахин шалгалт зөвшөөрсөн',
  retake_reject: 'Дахин шалгалт татгалзсан',
  question_correction_approve: 'Засвар зөвшөөрсөн',
  question_correction_reject: 'Засвар татгалзсан',
  bulk_action: 'Багц үйлдэл',
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('');

  useEffect(() => {
    const fetchAudit = async () => {
      setLoading(true);
      try {
        let q;
        if (filterAction) {
          q = query(collection(db, "admin_audit"), where("action", "==", filterAction), orderBy("createdAt", "desc"), limit(100));
        } else {
          q = query(collection(db, "admin_audit"), orderBy("createdAt", "desc"), limit(100));
        }
        const snap = await getDocs(q);
        setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditEntry)));
      } catch (err) {
        console.error("[audit] fetch failed:", err);
        toast.error(err instanceof Error ? err.message : "Лог татахад алдаа");
      } finally {
        setLoading(false);
      }
    };
    fetchAudit();
  }, [filterAction]);

  return (
    <ErrorBoundary label="Аудит логыг харуулахад алдаа">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-black">Аудит лог</h1>
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">— Бүх үйлдэл —</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Уншиж байна...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-slate-500">Бүртгэл олдсонгүй</div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b text-xs uppercase font-bold">
                  <tr>
                    <th className="px-4 py-3 text-left">Огноо</th>
                    <th className="px-4 py-3 text-left">Үйлдэл</th>
                    <th className="px-4 py-3 text-left">Гүйцэтгэгч</th>
                    <th className="px-4 py-3 text-left">Зорилт</th>
                    <th className="px-4 py-3 text-left">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {toDate(e.createdAt).toLocaleString('mn-MN')}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {ACTION_LABELS[e.action] || e.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {e.actorUid.slice(0, 12)}...
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {e.targetUid ? `${e.targetUid.slice(0, 12)}...` : e.targetResource || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {e.ipAddress || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
}
