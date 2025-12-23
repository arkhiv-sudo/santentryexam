import { requireRole } from "@/lib/session";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Server-side check: This runs before the client component is sent
    await requireRole(["admin"]);

    return <>{children}</>;
}
