import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
    try {
        const { examId } = await params;

        // ✓ Use session cookie (same as questions API) — avoids Bearer token expiry mid-exam
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("__session")?.value;
        if (!sessionCookie) {
            return NextResponse.json({ error: "Нэвтрээгүй байна" }, { status: 401 });
        }
        let studentId: string;
        let decodedToken: Awaited<ReturnType<typeof adminAuth.verifySessionCookie>>;
        try {
            decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
            studentId = decodedToken.uid;
        } catch {
            return NextResponse.json({ error: "Сессион хүчингүй" }, { status: 401 });
        }

        const body = await req.json();
        const { answers, timeTaken, studentName } = body;

        // 1. Check if already submitted
        const existingSubmissions = await adminDb.collection("submissions")
            .where("examId", "==", examId)
            .where("studentId", "==", studentId)
            .limit(1)
            .get();

        if (!existingSubmissions.empty) {
            return NextResponse.json({ error: "Шалгалтыг аль хэдийн өгсөн байна." }, { status: 400 });
        }

        // 2. Fetch the exam
        const examDoc = await adminDb.collection("exams").doc(examId).get();
        if (!examDoc.exists) {
            return NextResponse.json({ error: "Шалгалт олдсонгүй." }, { status: 404 });
        }
        const examData = examDoc.data()!;
        const questionIds: string[] = examData.questionIds || [];
        const passingScoreNum = examData.passingScore || 0;
        const MAX_VIOLATIONS = 3;

        // ✓ Check violations — if the student was already auto-submitted via cheating, reject
        const regForViolationCheck = await adminDb.collection("registrations")
            .where("examId", "==", examId)
            .where("studentId", "==", studentId)
            .limit(1)
            .get();
        if (!regForViolationCheck.empty) {
            const regData = regForViolationCheck.docs[0].data();
            if ((regData.violations || 0) >= MAX_VIOLATIONS && regData.status === "completed") {
                return NextResponse.json({ error: "Хуулах оролдлогоос олон шалгалт хүчингүй болсонаар." }, { status: 403 });
            }
        }

        // ✓ FIX: maxScore = sum of all question points, not just count
        let maxScore = 0;
        if (examData.questionSnapshot && examData.questionSnapshot.length > 0) {
            maxScore = examData.questionSnapshot.reduce(
                (sum: number, q: { points?: number }) => sum + (q.points || 1),
                0
            );
        } else {
            maxScore = questionIds.length; // legacy fallback if no snapshot
        }
        const gradedAnswers: Record<string, import("@/types").GradedAnswer> = {};
        let score = 0;

        if (maxScore > 0) {
            // ✅ OPTIMIZATION: Read answers from single exam_answers document (1 read instead of N)
            const answerDoc = await adminDb.collection("exam_answers").doc(examId).get();
            let answerKey: Record<string, string> = {};
            
            if (answerDoc.exists) {
                answerKey = answerDoc.data()?.answerKey || {};
            } else {
                // Legacy fallback for old exams without an exam_answers doc
                const docRefs = questionIds.map(id => adminDb.collection("questions").doc(id));
                // Fetch in chunks of 50
                for (let i = 0; i < docRefs.length; i += 50) {
                    const chunk = docRefs.slice(i, i + 50);
                    if (chunk.length > 0) {
                        const qDocs = await adminDb.getAll(...chunk);
                        qDocs.forEach(d => {
                            if (d.exists) answerKey[d.id] = d.data()?.correctAnswer || "";
                        });
                    }
                }
            }

            // Grade
            for (const qId of questionIds) {
                const studentAns = answers[qId] || "";
                const correctAns = answerKey[qId] || "";
                
                // Use questionSnapshot to get points if available
                let points = 1;
                if (examData.questionSnapshot) {
                    const snapQ = examData.questionSnapshot.find((q: import("@/types").ExamQuestion) => q.id === qId);
                    if (snapQ && snapQ.points) {
                        points = snapQ.points;
                    }
                }

                const studentAnsClean = studentAns.trim().toLowerCase();
                const correctAnsClean = String(correctAns).trim().toLowerCase();
                const isCorrect = studentAnsClean === correctAnsClean && correctAnsClean !== "";
                
                const earnedPoints = isCorrect ? points : 0;
                if (isCorrect) {
                     score += points; // Increment score by question points (or 1 by default)
                }

                gradedAnswers[qId] = {
                    studentAnswer: studentAns,
                    correctAnswer: correctAns,
                    isCorrect,
                    points,
                    earnedPoints
                };
            }
        }

        const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
        const passed = percentage >= passingScoreNum;

        // 4, 5, 6: Atomic save of the student's submission via a single batch
        const submitBatch = adminDb.batch();
        
        const submissionRef = adminDb.collection("submissions").doc();
        const now = new Date();
        submitBatch.set(submissionRef, {
            examId,
            studentId,
            studentName: studentName || decodedToken.email || studentId,
            answers,
            timeTaken: timeTaken || 0,
            submittedAt: now,
            gradedAt: now,
            graded: true,
            score,
            maxScore,
            percentage,
            passed,
            gradedAnswers
        });

        const resultRef = adminDb.collection("exam_results").doc();
        submitBatch.set(resultRef, {
            submissionId: submissionRef.id,
            examId,
            examTitle: examData.title || "Шалгалт",
            studentId,
            studentName: studentName || decodedToken.email || studentId,
            score,
            maxScore,
            percentage,
            passed,
            passingScore: passingScoreNum,
            gradedAt: now,
            timeTaken: timeTaken || 0,
            rank: passed ? 0 : null // will be calculated below
        });
        
        // Update exam total participants count
        submitBatch.update(examDoc.ref, {
             totalParticipants: FieldValue.increment(1)
        });

        const registrationQuery = await adminDb.collection("registrations")
            .where("examId", "==", examId)
            .where("studentId", "==", studentId)
            .limit(1)
            .get();
            
        if (!registrationQuery.empty) {
            submitBatch.update(registrationQuery.docs[0].ref, {
                status: "completed",
                completedAt: now,
                score,
                maxScore,
                percentage,
                passed
            });
        }

        // Commit the atomic submission block
        await submitBatch.commit();

        // 7. Recalculate ranks for this exam (Isolated so errors don't fail the user)
        try {
            const allPassingResultsSnap = await adminDb.collection("exam_results")
                .where("examId", "==", examId)
                .where("passed", "==", true)
                .get();

            if (!allPassingResultsSnap.empty) {
                const resultsData = allPassingResultsSnap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        score: data.score as number,
                        timeTaken: data.timeTaken as number | undefined,
                        rank: data.rank as number | null
                    };
                });
                
                // Sort: highest score first, then lowest timeTaken
                resultsData.sort((a, b) => {
                    if (b.score !== a.score) {
                        return b.score - a.score;
                    }
                    const timeA = a.timeTaken || 999999;
                    const timeB = b.timeTaken || 999999;
                    return timeA - timeB;
                });
                
                // Assign ranks (1-based) using chunks of 500
                const chunks = [];
                for (let i = 0; i < resultsData.length; i += 500) {
                    chunks.push(resultsData.slice(i, i + 500));
                }
                
                let globalRank = 1;
                for (const chunk of chunks) {
                    const rankBatch = adminDb.batch();
                    let operationsCount = 0;

                    chunk.forEach((res) => {
                        const rank = globalRank++;
                        if (res.rank !== rank) {
                            rankBatch.update(adminDb.collection("exam_results").doc(res.id), { rank });
                            operationsCount++;
                        }
                    });

                    if (operationsCount > 0) {
                        await rankBatch.commit();
                    }
                }
            }
        } catch (rankErr) {
            console.error("Failed to recalculate ranks (non-fatal):", rankErr);
        }

        return NextResponse.json({ success: true, score, percentage, passed });
    } catch (error: unknown) {
        console.error("Submission error:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
    }
}
