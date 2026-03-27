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

        // Google sign-in → parent role
        const isGoogle = providerData.some(p => p.providerId === "google.com");
        if (isGoogle) {
            role = "parent";
        }

        if (!docSnap.exists) {
            const fullName = displayName || email?.split("@")[0] || "User";
            const names = fullName.trim().split(/\s+/);
            // Mongolian convention: lastName comes first in displayName
            const lastName = names.length > 1 ? names.slice(0, -1).join(' ') : "";
            const firstName = names[names.length - 1];

            const profileData: Record<string, unknown> = {
                uid,
                email,
                firstName: firstName || "",
                lastName: lastName || "",
                role,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (role === "parent") {
                profileData.children = [];
            }

            await userRef.set(profileData);
            console.log(`User profile created for ${uid} with role ${role}`);
        } else {
            role = docSnap.data()?.role || role;
        }

        await admin.auth().setCustomUserClaims(uid, { role });
    } catch (error) {
        console.error("Error in onUserCreate:", error);
    }
});

// ─── Helper: update global statistics ────────────────────────────────────────
const updateStat = async (field: string, increment: number) => {
    const statsRef = db.collection("system").doc("stats");
    try {
        await statsRef.set(
            {
                [field]: admin.firestore.FieldValue.increment(increment),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
    } catch (error) {
        console.error(`Error updating stat ${field}:`, error);
    }
};

// ─── Helper: randomly shuffle array ──────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ─── Helper: randomly assign questions to published exam ─────────────────────
async function assignQuestionsToExam(examId: string, examData: Record<string, unknown>) {
    const subjectDistribution = examData.subjectDistribution as { subjectId: string; count: number }[] | undefined;
    const grade = examData.grade as string | undefined;

    if (!subjectDistribution || !grade) {
        console.warn(`Exam ${examId}: missing subjectDistribution or grade, skipping question assignment.`);
        return;
    }

    const allQuestionIds: string[] = [];

    for (const { subjectId, count } of subjectDistribution) {
        if (!count || count <= 0) continue;

        const snapshot = await db.collection("questions")
            .where("grade", "==", grade)
            .where("subject", "==", subjectId)
            .get();

        const available = snapshot.docs
            .filter(d => d.data().status !== "archived")
            .map(d => d.id);

        const selected = shuffle(available).slice(0, count);
        allQuestionIds.push(...selected);

        if (selected.length < count) {
            console.warn(`Exam ${examId}: subject ${subjectId} needs ${count} questions but only ${selected.length} available.`);
        }
    }

    // Shuffle the combined question list so subjects are intermixed
    const shuffledAll = shuffle(Array.from(new Set(allQuestionIds)));

    // Fetch all question data to build snapshot and answer key
    const questionSnapshot: any[] = [];
    const answerKey: Record<string, string> = {};
    const questionRefs = shuffledAll.map(id => db.collection("questions").doc(id));
    
    for (let i = 0; i < questionRefs.length; i += 50) {
        const chunk = questionRefs.slice(i, i + 50);
        if (chunk.length > 0) {
            const docs = await db.getAll(...chunk);
            docs.forEach(doc => {
                const data = doc.data();
                if (data) {
                    answerKey[doc.id] = data.correctAnswer || "";
                    // Create safe snapshot without correctAnswer or solution
                    const safeQ = {
                        id: doc.id,
                        type: data.type,
                        content: data.content,
                        points: data.points || 1,
                        subject: data.subject,
                    } as any;
                    
                    if (data.options) safeQ.options = data.options;
                    if (data.optionImages) safeQ.optionImages = data.optionImages;
                    if (data.mediaUrl) safeQ.mediaUrl = data.mediaUrl;
                    if (data.mediaType) safeQ.mediaType = data.mediaType;
                    
                    questionSnapshot.push(safeQ);
                }
            });
        }
    }
    
    // Ensure snapshot maintains the randomized order
    const orderedSnapshot = shuffledAll.map(id => questionSnapshot.find(q => q.id === id)).filter(Boolean);

    await db.collection("exams").doc(examId).update({
        questionIds: shuffledAll,
        questionSnapshot: orderedSnapshot,
        questionsAssigned: true,
        questionsAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Save answer key to a secured collection only accessible by servers/admins
    await db.collection("exam_answers").doc(examId).set({
        answerKey,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Exam ${examId}: assigned ${shuffledAll.length} questions and built snapshots.`);
}

// ─── User Profile Triggers ────────────────────────────────────────────────────
export const onUserProfileCreate = functions.firestore
    .document("users/{userId}")
    .onCreate(async (snap, context) => {
        const userData = snap.data();
        const userId = context.params.userId;

        await updateStat("totalUsers", 1);

        // Auto-link parent ↔ student
        try {
            if (userData.role === "student" && userData.parentEmail) {
                const parentQuery = await db.collection("users")
                    .where("email", "==", userData.parentEmail)
                    .where("role", "==", "parent")
                    .get();

                if (!parentQuery.empty) {
                    const parentDoc = parentQuery.docs[0];
                    await parentDoc.ref.update({
                        children: admin.firestore.FieldValue.arrayUnion(userId),
                    });
                    console.log(`Student ${userId} linked to parent ${parentDoc.id}`);
                }
            } else if (userData.role === "parent" && userData.email) {
                const studentsQuery = await db.collection("users")
                    .where("parentEmail", "==", userData.email)
                    .where("role", "==", "student")
                    .get();

                if (!studentsQuery.empty) {
                    const studentIds = studentsQuery.docs.map(d => d.id);
                    // arrayUnion with spread works correctly with individual items
                    await snap.ref.update({
                        children: admin.firestore.FieldValue.arrayUnion(...studentIds),
                    });
                    console.log(`Parent ${userId} linked to students: ${studentIds.join(", ")}`);
                }
            }
        } catch (error) {
            console.error("Error in automated parent-student linking:", error);
        }
    });

export const onUserProfileDelete = functions.firestore
    .document("users/{userId}")
    .onDelete(async () => {
        await updateStat("totalUsers", -1);
    });

// ─── Question Triggers ────────────────────────────────────────────────────────
export const onQuestionCreate = functions.firestore
    .document("questions/{questionId}")
    .onCreate(async () => {
        await updateStat("totalQuestions", 1);
    });

export const onQuestionDelete = functions.firestore
    .document("questions/{questionId}")
    .onDelete(async (snap, context) => {
        const questionId = context.params.questionId;
        await updateStat("totalQuestions", -1);

        // Cascade delete exams containing this question
        const examsSnap = await db.collection("exams").where("questionIds", "array-contains", questionId).get();
        if (!examsSnap.empty) {
            const batch = db.batch();
            examsSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Deleted ${examsSnap.size} exams cascading from deleted question ${questionId}`);
        }
    });

// ─── Exam Triggers ────────────────────────────────────────────────────────────
export const onExamCreate = functions.firestore
    .document("exams/{examId}")
    .onCreate(async (snap, context) => {
        await updateStat("totalExams", 1);
        const data = snap.data();
        console.log(`Exam ${context.params.examId} created – assigning questions.`);
        await assignQuestionsToExam(context.params.examId, data);
    });

export const onExamDelete = functions.firestore
    .document("exams/{examId}")
    .onDelete(async (snap, context) => {
        const examId = context.params.examId;
        await updateStat("totalExams", -1);

        // Cascade delete registrations, submissions, exam_results, and exam_answers
        const collectionsToDeleteFrom = ["registrations", "submissions", "exam_results"];
        
        for (const col of collectionsToDeleteFrom) {
            const querySnap = await db.collection(col).where("examId", "==", examId).get();
            if (!querySnap.empty) {
                // Batch delete in chunks of 500
                const chunks = [];
                for (let i = 0; i < querySnap.docs.length; i += 500) {
                    chunks.push(querySnap.docs.slice(i, i + 500));
                }
                for (const chunk of chunks) {
                    const batch = db.batch();
                    chunk.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            }
        }

        // Delete answerKey if exists
        const ansDoc = await db.collection("exam_answers").doc(examId).get();
        if (ansDoc.exists) {
            await ansDoc.ref.delete();
        }
        
        console.log(`Deleted all related data for exam ${examId}`);
    });

/**
 * When exam status changes to 'published', automatically assign questions.
 */
export const onExamUpdate = functions.firestore
    .document("exams/{examId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        const statusChangedToPublished = before.status !== "published" && after.status === "published";
        const subjectDistributionChanged = JSON.stringify(before.subjectDistribution) !== JSON.stringify(after.subjectDistribution);

        if (statusChangedToPublished) {
            if (!after.questionsAssigned) {
                console.log(`Exam ${context.params.examId} published – assigning questions.`);
                await assignQuestionsToExam(context.params.examId, after);
            }
        } else if (after.status === "draft" && subjectDistributionChanged) {
            console.log(`Exam ${context.params.examId} draft updated – re-assigning questions.`);
            await assignQuestionsToExam(context.params.examId, after);
        }
    });

// ─── Registration Triggers ────────────────────────────────────────────────────
/**
 * When a student starts an exam (status: registered → started),
 * notify their parent.
 */
export const onRegistrationUpdate = functions.firestore
    .document("registrations/{registrationId}")
    .onUpdate(async (change) => {
        const before = change.before.data();
        const after = change.after.data();

        if (before.status === "registered" && after.status === "started") {
            const { studentId, examId } = after;
            await notifyParentOfExamEvent(studentId, examId, "exam_started");
        }
    });

// ─── Submission Triggers ──────────────────────────────────────────────────────
/**
 * Grade submission and notify parent when student submits exam.
 */
export const onSubmissionCreate = functions.firestore
    .document("submissions/{submissionId}")
    .onCreate(async (snap) => {
        await updateStat("totalSubmissions", 1);

        const submission = snap.data();
        const { examId, studentId, studentName, score, maxScore, percentage } = submission;

        try {
            // Fetch exam title for notification
            const examDoc = await db.collection("exams").doc(examId).get();
            const examTitle = examDoc.exists ? examDoc.data()?.title || "" : "";

            // Notify parent
            await notifyParentOfExamEvent(studentId, examId, "score_available", {
                score,
                maxScore,
                percentage,
                examTitle,
                studentName,
            });
        } catch (error) {
            console.error("Error sending submission notification:", error);
        }
    });

export const onSubmissionDelete = functions.firestore
    .document("submissions/{submissionId}")
    .onDelete(async () => {
        await updateStat("totalSubmissions", -1);
    });

// ─── Helper: notify parent ───────────────────────────────────────────────────
async function notifyParentOfExamEvent(
    studentId: string,
    examId: string,
    type: "exam_started" | "score_available",
    extra?: {
        score?: number;
        maxScore?: number;
        percentage?: number;
        examTitle?: string;
        studentName?: string;
    }
) {
    try {
        const studentDoc = await db.collection("users").doc(studentId).get();
        if (!studentDoc.exists) return;

        const studentData = studentDoc.data()!;
        const parentEmail = studentData.parentEmail as string | undefined;
        if (!parentEmail) return;

        const studentName = extra?.studentName || `${studentData.lastName || ""} ${studentData.firstName || ""}`.trim();

        let examTitle = extra?.examTitle || "";
        if (!examTitle) {
            const examDoc = await db.collection("exams").doc(examId).get();
            if (examDoc.exists) examTitle = examDoc.data()?.title || "";
        }

        const parentQuery = await db.collection("users")
            .where("email", "==", parentEmail)
            .where("role", "==", "parent")
            .get();

        if (parentQuery.empty) return;

        const parentId = parentQuery.docs[0].id;

        let message = "";
        if (type === "exam_started") {
            message = `${studentName} "${examTitle}" шалгалтыг эхлүүллээ.`;
        } else if (type === "score_available") {
            message = `${studentName}-ийн "${examTitle}" шалгалтын дүн гарлаа. Оноо: ${extra?.score}/${extra?.maxScore} (${extra?.percentage}%).`;
        }

        await db.collection("notifications").add({
            type,
            recipientId: parentId,
            studentId,
            studentName,
            examId,
            examTitle,
            message,
            score: extra?.score ?? null,
            maxScore: extra?.maxScore ?? null,
            percentage: extra?.percentage ?? null,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error(`Error notifying parent (${type}):`, error);
    }
}

// ─── Subject Triggers ─────────────────────────────────────────────────────────
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

// ─── Image Index Triggers ─────────────────────────────────────────────────────
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

// ─── Callable: Manual stats recalculation ────────────────────────────────────
export const recalculateStats = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Only admins can recalculate stats.");
    }

    try {
        const [usersCount, questionsCount, examsCount, subjectsCount, submissionsCount, imagesCount] =
            await Promise.all([
                db.collection("users").count().get().then(s => s.data().count),
                db.collection("questions").count().get().then(s => s.data().count),
                db.collection("exams").count().get().then(s => s.data().count),
                db.collection("subjects").count().get().then(s => s.data().count),
                db.collection("submissions").count().get().then(s => s.data().count),
                db.collection("image_index").count().get().then(s => s.data().count),
            ]);

        await db.collection("system").doc("stats").set(
            {
                totalUsers: usersCount,
                totalQuestions: questionsCount,
                totalExams: examsCount,
                totalSubjects: subjectsCount,
                totalSubmissions: submissionsCount,
                totalImages: imagesCount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return { success: true, stats: { totalUsers: usersCount, totalQuestions: questionsCount, totalExams: examsCount, totalSubjects: subjectsCount, totalSubmissions: submissionsCount, totalImages: imagesCount } };
    } catch (error: unknown) {
        console.error("Recalculate stats failed:", error);
        throw new functions.https.HttpsError("internal", (error as Error).message);
    }
});

// ─── Callable: Re-assign questions for a published exam ──────────────────────
export const reassignExamQuestions = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Only admins can reassign exam questions.");
    }

    const { examId } = data as { examId: string };
    if (!examId) {
        throw new functions.https.HttpsError("invalid-argument", "examId is required.");
    }

    const examDoc = await db.collection("exams").doc(examId).get();
    if (!examDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Exam not found.");
    }

    await assignQuestionsToExam(examId, examDoc.data() as Record<string, unknown>);
    return { success: true };
});

// ─── Infrastructure usage (admin monitoring) ─────────────────────────────────
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
                aggregation: {
                    alignmentPeriod: { seconds: 86400 },
                    perSeriesAligner: "ALIGN_SUM",
                },
            });

            const dailyData: Record<string, number> = {};
            timeSeries.forEach(series => {
                series.points?.forEach(point => {
                    const date = new Date(Number(point.interval?.endTime?.seconds || 0) * 1000);
                    const dateStr = date.toISOString().split("T")[0];
                    dailyData[dateStr] = (dailyData[dateStr] || 0) + Number(point.value?.int64Value || 0);
                });
            });
            return dailyData;
        } catch (e) {
            console.error(`Error fetching metric ${metricType}:`, e);
            return {};
        }
    };

    try {
        const [readsMap, writesMap, deletesMap] = await Promise.all([
            getDailyMetrics("firestore.googleapis.com/document/read_ops_count"),
            getDailyMetrics("firestore.googleapis.com/document/write_ops_count"),
            getDailyMetrics("firestore.googleapis.com/document/delete_ops_count"),
        ]);

        const todayStr = endTime.toISOString().split("T")[0];
        const history = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(endTime.getTime() - i * 24 * 60 * 60 * 1000);
            const dStr = d.toISOString().split("T")[0];
            history.push({
                date: dStr,
                reads: readsMap[dStr] || 0,
                writes: writesMap[dStr] || 0,
                deletes: deletesMap[dStr] || 0,
                isToday: dStr === todayStr,
            });
        }

        const today = history[history.length - 1];
        return {
            success: true,
            usage: {
                reads: today.reads,
                writes: today.writes,
                deletes: today.deletes,
                firestoreSize: 0,
                storageSize: 0,
                history,
            },
        };
    } catch (error: unknown) {
        console.error("Failed to fetch monitoring metrics:", error);
        return { success: false, error: (error as Error).message };
    }
});
