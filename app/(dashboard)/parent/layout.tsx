import { requireRole } from "@/lib/session";

export default async function ParentLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Server-side check: only parent (and admin) can access parent pages
    await requireRole(["parent", "admin"]);
    return <>{children}</>;
}
