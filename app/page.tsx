"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user && profile) {
        // Redirect to role-specific dashboard
        if (profile.role === 'admin') router.push('/admin');
        else if (profile.role === 'teacher') router.push('/teacher');
        else if (profile.role === 'parent') router.push('/parent');
        else if (profile.role === 'student') router.push('/student');
        else router.push('/login');
      } else {
        router.push("/login");
      }
    }
  }, [user, profile, loading, router]);

  // Return null to avoid any flash of content
  return null;
}
