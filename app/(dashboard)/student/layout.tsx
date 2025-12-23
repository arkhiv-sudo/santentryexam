import { requireRole } from "@/lib/session";

export default async function StudentLayout({
    children,
}: {
    children: React.ReactNode
}) {
    await requireRole(["student", "admin"]);
    return <>{children}</>;
}
