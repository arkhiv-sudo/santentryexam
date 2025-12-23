import { requireRole } from "@/lib/session";

export default async function TeacherLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Server-side check
    await requireRole(["teacher", "admin"]);

    return <>{children}</>;
}
