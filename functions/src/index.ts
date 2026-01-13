import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { MetricServiceClient } from "@google-cloud/monitoring";

admin.initializeApp();

const db = admin.firestore();

/**
 * Automatically create a Firestore user profile document when a new user
 * signs up via Firebase Authentication.
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
    const { uid, email, displayName, providerData } = user;
    const userRef = db.collection("users").doc(uid);

    try {
        const docSnap = await userRef.get();
        let role = "student";

        // Check if user signed up via Google
        const isGoogle = providerData.some(p => p.providerId === "google.com");
        if (isGoogle) {
            role = "parent";
        }

        if (!docSnap.exists) {
            const fullName = displayName || email?.split("@")[0] || "User";
            const names = fullName.split(' ');
            const firstName = names.length > 1 ? names.pop() : names[0];
            const lastName = names.length > 0 ? names.join(' ') : "";

            await userRef.set({
                uid,
                email,
                firstName: firstName || "",
                lastName: lastName || "",
                role: role,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log(`User profile created for ${uid} with role ${role}`);
        } else {
            // doc exists (likely from client-side signup), get the role from there
            role = docSnap.data()?.role || role;
            console.log(`User profile already exists for ${uid}, skipping creation.`);
        }

        // Set Custom Claims for the role
        await admin.auth().setCustomUserClaims(uid, { role });
        console.log(`Custom claims set for ${uid}: { role: "${role}" }`);

    } catch (error) {
        console.error("Error in onUserCreate:", error);
    }
});

// Helper to update statistics
const updateStat = async (field: string, increment: number) => {
    const statsRef = db.collection("system").doc("stats");
    try {
        await statsRef.set({
            [field]: admin.firestore.FieldValue.increment(increment),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error(`Error updating stat ${field}:`, error);
    }
};

// User Profile Triggers
export const onUserProfileCreate = functions.firestore
    .document("users/{userId}")
    .onCreate(async () => {
        await updateStat("totalUsers", 1);
    });

export const onUserProfileDelete = functions.firestore
    .document("users/{userId}")
    .onDelete(async () => {
        await updateStat("totalUsers", -1);
    });

// Question Triggers
export const onQuestionCreate = functions.firestore
    .document("questions/{questionId}")
    .onCreate(async () => {
        await updateStat("totalQuestions", 1);
    });

export const onQuestionDelete = functions.firestore
    .document("questions/{questionId}")
    .onDelete(async () => {
        await updateStat("totalQuestions", -1);
    });

// Exam Triggers
export const onExamCreate = functions.firestore
    .document("exams/{examId}")
    .onCreate(async () => {
        await updateStat("totalExams", 1);
    });

export const onExamDelete = functions.firestore
    .document("exams/{examId}")
    .onDelete(async () => {
        await updateStat("totalExams", -1);
    });

// Subject Triggers
export const onSubjectCreate = functions.firestore
    .document("subjects/{subjectId}")
    .onCreate(async () => {
        await updateStat("totalSubjects", 1);
    });

export const onSubjectDelete = functions.firestore
    .document("subjects/{subjectId}")
    .onDelete(async () => {
        await updateStat("totalSubjects", -1);
    });

// Submission Triggers
export const onSubmissionCreate = functions.firestore
    .document("submissions/{submissionId}")
    .onCreate(async () => {
        await updateStat("totalSubmissions", 1);
    });

export const onSubmissionDelete = functions.firestore
    .document("submissions/{submissionId}")
    .onDelete(async () => {
        await updateStat("totalSubmissions", -1);
    });

// Image Index Triggers
export const onImageIndexCreate = functions.firestore
    .document("image_index/{hash}")
    .onCreate(async () => {
        await updateStat("totalImages", 1);
    });

export const onImageIndexDelete = functions.firestore
    .document("image_index/{hash}")
    .onDelete(async () => {
        await updateStat("totalImages", -1);
    });

// Manual Recalculation Function
export const recalculateStats = functions.https.onCall(async (data, context) => {
    // Check for admin role
    if (!context.auth || context.auth.token.role !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Only admins can recaluate stats.");
    }

    try {
        const usersCount = (await db.collection("users").count().get()).data().count;
        const questionsCount = (await db.collection("questions").count().get()).data().count;
        const examsCount = (await db.collection("exams").count().get()).data().count;
        const subjectsCount = (await db.collection("subjects").count().get()).data().count;
        const submissionsCount = (await db.collection("submissions").count().get()).data().count;
        const imagesCount = (await db.collection("image_index").count().get()).data().count;

        const statsRef = db.collection("system").doc("stats");
        await statsRef.set({
            totalUsers: usersCount,
            totalQuestions: questionsCount,
            totalExams: examsCount,
            totalSubjects: subjectsCount,
            totalSubmissions: submissionsCount,
            totalImages: imagesCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            success: true,
            stats: {
                totalUsers: usersCount,
                totalQuestions: questionsCount,
                totalExams: examsCount,
                totalSubjects: subjectsCount,
                totalSubmissions: submissionsCount,
                totalImages: imagesCount
            }
        };
    } catch (error: any) {
        console.error("Recalculate stats failed:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

const monitoringClient = new MetricServiceClient();

export const getInfrastructureUsage = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Only admins can view usage metrics.");
    }

    const projectId = process.env.GCLOUD_PROJECT || "santentryexam";
    const projectPath = monitoringClient.projectPath(projectId);

    const endTime = new Date();
    const startTimeSevenDaysAgo = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    startTimeSevenDaysAgo.setHours(0, 0, 0, 0);

    const getDailyMetrics = async (metricType: string) => {
        try {
            const [timeSeries] = await monitoringClient.listTimeSeries({
                name: projectPath,
                filter: `metric.type="${metricType}"`,
                interval: {
                    startTime: { seconds: Math.floor(startTimeSevenDaysAgo.getTime() / 1000) },
                    endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
                },
                // Request daily aggregation
                aggregation: {
                    alignmentPeriod: { seconds: 86400 }, // 24 hours
                    perSeriesAligner: "ALIGN_SUM",
                },
            });

            const dailyData: { [date: string]: number } = {};

            timeSeries.forEach(series => {
                series.points?.forEach(point => {
                    const date = new Date(Number(point.interval?.endTime?.seconds || 0) * 1000);
                    const dateStr = date.toISOString().split('T')[0];
                    dailyData[dateStr] = (dailyData[dateStr] || 0) + Number(point.value?.int64Value || 0);
                });
            });
            return dailyData;
        } catch (e) {
            console.error(`Error fetching historical metric ${metricType}:`, e);
            return {};
        }
    };

    try {
        const readsMap = await getDailyMetrics("firestore.googleapis.com/document/read_ops_count");
        const writesMap = await getDailyMetrics("firestore.googleapis.com/document/write_ops_count");
        const deletesMap = await getDailyMetrics("firestore.googleapis.com/document/delete_ops_count");

        // Fetch Gauge metrics for current size
        const getGaugeValue = async (metricType: string) => {
            try {
                const [timeSeries] = await monitoringClient.listTimeSeries({
                    name: projectPath,
                    filter: `metric.type="${metricType}"`,
                    interval: {
                        startTime: { seconds: Math.floor((endTime.getTime() - 24 * 60 * 60 * 1000) / 1000) }, // Last 24 hours (Storage metrics are often sampled daily)
                        endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
                    },
                });

                if (timeSeries.length > 0 && timeSeries[0].points && timeSeries[0].points.length > 0) {
                    return Number(timeSeries[0].points[0].value?.int64Value || 0);
                }
                return 0;
            } catch (e) {
                console.error(`Error fetching gauge ${metricType}:`, e);
                return 0;
            }
        };

        const firestoreSize = await getGaugeValue("firestore.googleapis.com/storage/total_bytes");
        const storageSize = await getGaugeValue("storage.googleapis.com/storage/total_bytes");

        // Merge maps into an array of history objects
        const todayStr = endTime.toISOString().split('T')[0];
        const history: any[] = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(endTime.getTime() - i * 24 * 60 * 60 * 1000);
            const dStr = d.toISOString().split('T')[0];
            history.push({
                date: dStr,
                reads: readsMap[dStr] || 0,
                writes: writesMap[dStr] || 0,
                deletes: deletesMap[dStr] || 0,
                isToday: dStr === todayStr
            });
        }

        const today = history[0];

        return {
            success: true,
            usage: {
                reads: today.reads,
                writes: today.writes,
                deletes: today.deletes,
                firestoreSize,
                storageSize,
                history: history.reverse() // Oldest first for charts
            }
        };
    } catch (error: any) {
        console.error("Failed to fetch monitoring metrics:", error);
        return { success: false, error: error.message };
    }
});

