"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { UserProfile } from "@/types";

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    refreshSession?: () => Promise<void>; // Added helper
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const lastRefreshRef = useRef<number>(0);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Remove getIdTokenResult(true) as it forces a refresh and triggers onIdTokenChanged
                const tokenResult = await firebaseUser.getIdTokenResult();
                const role = (tokenResult.claims.role as UserProfile['role']) || 'student';

                setUser(firebaseUser);

                try {
                    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        setProfile({
                            uid: firebaseUser.uid,
                            email: firebaseUser.email!,
                            lastName: data.lastName || "",
                            firstName: data.firstName || "",
                            role: role,
                            parentEmail: data.parentEmail,
                            studentCode: data.studentCode,
                            aimag: data.aimag,
                            soum: data.soum,
                            school: data.school,
                            class: data.class,
                            children: data.children
                        });
                    } else {
                        // Fallback for new users (Google)
                        const displayName = firebaseUser.displayName || "";
                        const firstName = displayName.split(' ').pop() || "";
                        const lastName = displayName.split(' ').slice(0, -1).join(' ') || "";
                        setProfile({
                            uid: firebaseUser.uid,
                            email: firebaseUser.email!,
                            firstName: firstName,
                            lastName: lastName,
                            role: role
                        });
                    }
                } catch (error) {
                    console.error("Error fetching user profile:", error);
                    setProfile({
                        uid: firebaseUser.uid,
                        email: firebaseUser.email!,
                        firstName: "User",
                        lastName: "",
                        role: role
                    });
                }
            } else {
                setUser(null);
                setProfile(null);
            }

            setLoading(false);
        });

        // Add ID token listener for session auto-refresh
        const unsubscribeToken = auth.onIdTokenChanged(async (firebaseUser) => {
            if (firebaseUser) {
                const now = Date.now();
                // Avoid refreshing more than once every 10 seconds
                if (now - lastRefreshRef.current < 10000) return;
                lastRefreshRef.current = now;

                console.log("ID Token changed, refreshing session cookie...");
                const idToken = await firebaseUser.getIdToken();
                try {
                    await fetch("/api/auth/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ idToken }),
                    });
                } catch (e) {
                    console.error("Failed to auto-refresh session", e);
                }
            }
        });

        return () => {
            unsubscribe();
            unsubscribeToken();
        };
    }, []);

    const refreshSession = async () => {
        if (!auth.currentUser) return;
        try {
            await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: await auth.currentUser.getIdToken(true) }),
            });
        } catch (e) {
            console.error("Failed to refresh session", e);
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, refreshSession }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
