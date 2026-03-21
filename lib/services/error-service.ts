import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export class ErrorLoggingService {
    static async logError(error: Error, info?: Record<string, unknown>, userId?: string) {
        try {
            const errorData = {
                message: error.message,
                stack: error.stack,
                name: error.name,
                info: info ? JSON.stringify(info) : null,
                userId: userId || "anonymous",
                timestamp: serverTimestamp(),
                url: typeof window !== "undefined" ? window.location.href : "server",
                userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "server",
            };

            const logsRef = collection(db, "system_logs");
            await addDoc(logsRef, errorData);
            
            console.error("Error successfully logged to system_logs:", errorData);
        } catch (e) {
            // Fallback if logging itself fails
            console.error("Failed to log error to Firestore:", e);
            console.error("Original error:", error);
        }
    }
}
