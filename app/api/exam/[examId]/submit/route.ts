import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { checkOrigin } from "@/lib/csrf";
import { logAdmin, getRequestMeta } from "@/lib/audit-log";

export async function POST(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
    const origin = checkOrigin(req);
    if (!origin.ok) return origin.response;

    try {
        const { examId } = await params;

        // ✓ Use session cookie (same as questions API) — avoids Bearer token expiry mid-exam
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("__session")?.value;
        if (!sessionCookie) {
            return NextResponse.json({ error: "Нэвтрээгүй байна" }, { status: 401 });
        }
        let callerUid: string;
        let decodedToken: Awaited<ReturnType<typeof adminAuth.verifySessionCookie>>;
        try {
            decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
            callerUid = decodedToken.uid;
        } catch {
            return NextResponse.json({ error: "Сессион хүчингүй" }, { status: 401 });
        }

        const body = await req.json();
        const { answers, timeTaken, studentName, adminOverride, targetStudentId } = body;

        // B2: Admin force-submit — the caller is an admin submitting on behalf of
        // another student (e.g. one who went offline mid-exam). We verify the
        // caller's role from the session cookie's custom claims, then use the
        // targetStudentId for everything downstream.
        let studentId: string;
        if (adminOverride) {
            if (decodedToken.role !== "admin") {
                return NextResponse.json({ error: "Зөвхөн админ хүчээр илгээх боломжтой" }, { status: 403 });
            }
            if (!targetStudentId) {
                return NextResponse.json({ error: "targetStudentId шаардлагатай" }, { status: 400 });
            }
            studentId = targetStudentId;
        } else {
            studentId = callerUid;
        }

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

        // Хугацааны шалгалт СЕРВЕР талд. Өмнө нь энд огт шалгадаггүй байсан тул
        // цаг дууссаны дараа ч илгээх боломжтой байв. Автомат илгээлт болон
        // сүлжээний саатлыг тооцож 2 минутын тэвчих хугацаа өгнө.
        const startedAtMs: number | null = examData.startedAt?.toMillis?.() ?? null;
        if (!adminOverride && startedAtMs) {
            const GRACE_MS = 2 * 60 * 1000;
            const examEndMs = startedAtMs + (examData.duration || 60) * 60 * 1000;
            if (Date.now() > examEndMs + GRACE_MS) {
                return NextResponse.json({ error: "Шалгалтын хугацаа дууссан тул илгээх боломжгүй." }, { status: 403 });
            }
        }

        const questionIds: string[] = examData.questionIds || [];
        const passingScoreNum = examData.passingScore || 0;
        const MAX_VIOLATIONS = 3;

        // Зөрчлийн шалгалт — БЛОКЛОХГҮЙ.
        //
        // Өмнө нь энд 403 буцаадаг байсан нь сурагчийн бүх хариултыг алдагдуулж
        // байсан: клиент 3 дахь зөрчил дээр автоматаар илгээхийг оролдоод сервер
        // татгалзахад submission ч, дүн ч үүсэхгүй, зөвхөн 60 секунд тутмын draft
        // үлддэг байв. Одоо илгээлтийг ХҮЛЭЭЖ АВААД `invalidatedByViolation`
        // тугаар тэмдэглэнэ — хариулт бүрэн хадгалагдаж, дүнг хүчинтэй болгох
        // эсэхийг админ шийднэ (/api/admin/results/validity).
        const registrationQuery = await adminDb.collection("registrations")
            .where("examId", "==", examId)
            .where("studentId", "==", studentId)
            .limit(1)
            .get();
        const violationCount = registrationQuery.empty
            ? 0
            : (registrationQuery.docs[0].data().violations as number | undefined) || 0;
        const invalidatedByViolation = !adminOverride && violationCount >= MAX_VIOLATIONS;

        // FIX 29: Enforce maxAttempts at submission time. Count previously approved
        // retake requests for this student+exam and reject if attempts exceed the limit.
        if (examData.maxAttempts && typeof examData.maxAttempts === 'number') {
            try {
                const approvedRetakes = await adminDb.collection('retake_requests')
                    .where('studentId', '==', studentId)
                    .where('examId', '==', examId)
                    .where('status', '==', 'approved')
                    .count().get();
                const attemptNumber = approvedRetakes.data().count + 1; // current attempt + previously approved retakes
                if (attemptNumber > examData.maxAttempts) {
                    return NextResponse.json({ error: `Дээд хязгаар (${examData.maxAttempts} оролдлого) хэтэрсэн` }, { status: 403 });
                }
            } catch (e) {
                console.error('[submit] maxAttempts check failed:', e);
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

            // FIX 21: Detect and alert on empty answer keys. Don't abort — still grade
            // so the student isn't blocked — but log heavily and notify the exam creator
            // so they can review/fix the exam configuration.
            const emptyKeys = questionIds.filter(qId => !answerKey[qId] || answerKey[qId] === '');
            if (emptyKeys.length > 0) {
                console.error(`[CRITICAL] Empty answer keys for exam ${examId}: ${emptyKeys.join(', ')}`);
                try {
                    if (examData.createdBy) {
                        await adminDb.collection('notifications').add({
                            recipientId: examData.createdBy,
                            type: 'system_alert',
                            title: 'Хариулт олдсонгүй',
                            message: `Шалгалт "${examData.title || ''}"-д ${emptyKeys.length} асуултын зөв хариу хоосон байна. Шалгалтын тохиргоог нь шалгана уу.`,
                            read: false,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                    }
                } catch {}
            }

            // Grade
            for (const qId of questionIds) {
                const studentAns = answers[qId] || "";
                const correctAns = answerKey[qId] || "";
                
                // Use questionSnapshot to get points if available
                let points = 1;
                let qOptions: string[] = [];
                let qType = "";
                if (examData.questionSnapshot) {
                    const snapQ = examData.questionSnapshot.find((q: import("@/types").ExamQuestion) => q.id === qId);
                    if (snapQ) {
                        if (snapQ.points) {
                            points = snapQ.points;
                        }
                        if (snapQ.options) {
                            qOptions = snapQ.options;
                        }
                        if (snapQ.type) {
                            qType = snapQ.type;
                        }
                    }
                }

                const stripFormatting = (str: string) => {
                    return str
                        .replace(/<[^>]+>/g, '') // remove HTML tags
                        .replace(/&nbsp;/g, ' ') // remove nbsp
                        .replace(/\\\(/g, '')    // remove latex \(
                        .replace(/\\\)/g, '')    // remove latex \)
                        .replace(/\\\[/g, '')    // remove latex \[
                        .replace(/\\\]/g, '')    // remove latex \]
                        .replace(/\$/g, '')      // remove $ delimiters
                        .replace(/\\d?frac\s*\{(-?\d+(?:\.\d+)?)\}\s*\{(-?\d+(?:\.\d+)?)\}/g, '$1/$2') // \dfrac{a}{b} → a/b
                        .replace(/\\(d?frac|cdot|times|sqrt|left|right)/g, '') // зүйрлэх LaTeX тушаал
                        .replace(/[{}]/g, '')    // үлдсэн latex braces
                        .replace(/\s+/g, ' ')    // normalize spaces
                        .trim()
                        .toLowerCase();
                };

                // input хэлбэрийн нэмэлт нормализаци (хариултын хувьд илүү уян)
                const normalizeForInput = (str: string) => {
                    let s = stripFormatting(str);
                    s = s.replace(/^[a-zа-я]\s*=\s*/i, '');   // "x = 2.7" → "2.7"
                    // Цэг таслалаар тусгаарласан мянгат нэгжийг авна (16,231,268 → 16231268)
                    s = s.replace(/(?<=\d),(?=\d{3}(\D|$))/g, '');
                    s = s.replace(/(?<=\d)\s+(?=\d{3}(\D|$))/g, '');
                    s = s.replace(/\s+/g, '');                  // зайг бүрэн арилгана
                    return s;
                };

                // Тоог ялгах (бутархай эсвэл аравтын)
                const toNumber = (s: string): number | null => {
                    // Мянгат separator-уудыг арилгана
                    let cleaned = s.replace(/(?<=\d)[ ,'](?=\d{3}(\D|$))/g, '');
                    cleaned = cleaned.replace(/[^\d.,/\-]/g, '');
                    const fracMatch = cleaned.match(/^(-?\d+)\/(\d+)$/);
                    if (fracMatch) {
                        const num = parseInt(fracMatch[1]);
                        const den = parseInt(fracMatch[2]);
                        if (den !== 0) return num / den;
                    }
                    const num = parseFloat(cleaned.replace(',', '.'));
                    return isNaN(num) ? null : num;
                };

                const studentAnsClean = stripFormatting(studentAns);
                const correctAnsClean = stripFormatting(String(correctAns));

                // Базовый шалгалт
                let isCorrect = (studentAnsClean === correctAnsClean ||
                                 studentAns.replace(/\s+/g, '').toLowerCase() === correctAnsClean.replace(/\s+/g, ''))
                                && correctAnsClean !== "";

                // ── Олон тоон хариу (жагсаалт) ────────────────────────────
                // Зөв хариу нь 2+ тоо бол ЗӨВХӨН олонлогоор жиших ба доорх
                // ганц тоон харьцуулалт руу УНАХГҮЙ. Эс бөгөөс «256,258,268»
                // нь parseFloat-аар 256.258 болж, дутуу хариу ч зөв тоологдоно.
                const toNumberList = (raw: string): number[] => stripFormatting(raw)
                    .replace(/[;]/g, ",")
                    .split(/[,\s]+/)
                    .map(part => toNumber(part))
                    .filter((n): n is number => n !== null)
                    .sort((a, b) => a - b);
                const correctList = toNumberList(String(correctAns));
                const isListAnswer = correctList.length >= 2;

                if (isListAnswer) {
                    if (!isCorrect) {
                        const studentList = toNumberList(studentAns);
                        isCorrect = studentList.length === correctList.length &&
                            studentList.every((n, idx) => Math.abs(n - correctList[idx]) < 0.001);
                    }
                }

                // Input хэлбэрийн хувьд илүү уян шалгалт (зөвхөн ганц утгатай хариунд)
                if (!isCorrect && !isListAnswer && qType === "input" && correctAnsClean !== "") {
                    const studentN = normalizeForInput(studentAns);
                    const correctN = normalizeForInput(String(correctAns));
                    if (studentN === correctN && studentN !== '') {
                        isCorrect = true;
                    } else {
                        // Тоон утга тулгах (5/6 vs 0.8333 vs 0,833)
                        const studentNum = toNumber(studentN);
                        const correctNum = toNumber(correctN);
                        if (studentNum !== null && correctNum !== null) {
                            if (Math.abs(studentNum - correctNum) < 0.001) {
                                isCorrect = true;
                            }
                        }
                    }
                }

                // Resilient check for corrupted questions that saved "a", "b", "c", "d"
                if (!isCorrect && qType === "multiple_choice" && qOptions.length > 0 && studentAnsClean !== "") {
                    const optionIndex = qOptions.findIndex(opt => opt.trim().toLowerCase() === studentAnsClean);
                    if (optionIndex !== -1) {
                        const validLetters = [
                            ["a", "а"], // Option A (Latin a, Cyrillic а)
                            ["b", "б"], // Option B
                            ["c", "в"], // Option C (Latin c, Cyrillic в)
                            ["d", "г"]  // Option D
                        ];
                        if (optionIndex < validLetters.length) {
                            if (validLetters[optionIndex].includes(correctAnsClean)) {
                                isCorrect = true;
                            }
                        }
                    }
                }
                
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

        // FIX 43: Practice mode — return graded answers without persisting a submission/result.
        // The student sees the breakdown but no permanent record is kept.
        const isPractice = examData.examMode === 'practice';
        if (isPractice) {
            return NextResponse.json({
                success: true,
                score,
                maxScore,
                percentage,
                passed,
                gradedAnswers,
                practice: true,
            });
        }

        // 4, 5, 6: Atomic save of the student's submission via a single batch
        const submitBatch = adminDb.batch();

        // B2: When the admin force-submits, decodedToken.email is the admin's email.
        // Never use that as the fallback — look up the target student's profile instead.
        let resolvedStudentName = studentName as string | undefined;
        if (!resolvedStudentName) {
            if (adminOverride) {
                try {
                    const userDoc = await adminDb.collection("users").doc(studentId).get();
                    if (userDoc.exists) {
                        const u = userDoc.data()!;
                        resolvedStudentName = `${u.lastName || ""} ${u.firstName || ""}`.trim() || (u.email as string) || studentId;
                    } else {
                        resolvedStudentName = studentId;
                    }
                } catch {
                    resolvedStudentName = studentId;
                }
            } else {
                resolvedStudentName = decodedToken.email || studentId;
            }
        }

        const submissionRef = adminDb.collection("submissions").doc();
        const now = new Date();
        submitBatch.set(submissionRef, {
            examId,
            studentId,
            studentName: resolvedStudentName,
            answers,
            timeTaken: timeTaken || 0,
            submittedAt: now,
            gradedAt: now,
            graded: true,
            score,
            maxScore,
            percentage,
            passed,
            gradedAnswers,
            // Provenance flag so admins/auditors can identify force-submits later
            // FIX 23: Always attribute force-submit to the authenticated caller from the
            // session cookie. Never trust body.adminUid which can be spoofed by clients.
            forceSubmittedByAdmin: adminOverride ? callerUid : null,
            invalidatedByViolation,
            violations: violationCount,
        });

        const resultRef = adminDb.collection("exam_results").doc();
        submitBatch.set(resultRef, {
            submissionId: submissionRef.id,
            examId,
            examTitle: examData.title || "Шалгалт",
            studentId,
            studentName: resolvedStudentName,
            score,
            maxScore,
            percentage,
            passed,
            passingScore: passingScoreNum,
            gradedAt: now,
            timeTaken: timeTaken || 0,
            invalidatedByViolation,
            violations: violationCount,
            rank: null // will be recalculated async below
        });
        
        // Update exam total participants count
        submitBatch.update(examDoc.ref, {
             totalParticipants: FieldValue.increment(1)
        });

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

        // FIX 32 / FIX 33: Audit log every force-submit (admin acting on behalf of a student).
        // Regular self-submits are not audited here — only the privileged admin override path.
        if (adminOverride) {
            const meta = getRequestMeta(req);
            await logAdmin({
                action: 'force_submit',
                actorUid: callerUid,
                actorRole: (decodedToken.role as string | undefined) || 'admin',
                targetUid: studentId,
                targetResource: `exams/${examId}`,
                metadata: {
                    submissionId: submissionRef.id,
                    score,
                    maxScore,
                    percentage,
                    passed,
                },
                ...meta,
            });
        }

        // 7. Respond immediately — rank recalculation runs fire-and-forget AFTER response
        // This ensures submit latency is not affected by rank recalculation cost.
        const recalculateRanks = async (eid: string) => {
            // FIX 5: Rank ALL participants, not just those who passed.
            // The previous filter on passed==true excluded failing students from the ranking,
            // producing misleading rank numbers (e.g., only 5 students ranked out of 50 actual).
            // ⚠️ Энд `orderBy("score","desc")` БАЙЖ БОЛОХГҮЙ: тэр нь
            // (examId ASC + score DESC) composite index шаарддаг бөгөөд тухайн
            // индекс төсөлд үүсээгүй тул query нь FAILED_PRECONDITION-оор унаж,
            // fire-and-forget catch дотор чимээгүй залгигдаж байсан — үүнээс болж
            // зэрэглэл (rank) хэзээ ч бичигддэггүй байв. Эрэмбийг доор JS дотор
            // хийдэг тул query-д эрэмбэлэх шаардлагагүй.
            const allResultsSnap = await adminDb.collection("exam_results")
                .where("examId", "==", eid)
                .get();

            if (allResultsSnap.empty) return;

            // Зөрчлийн улмаас хүчингүй болсон дүн эрэмбэд ОРОХГҮЙ — rank нь null
            // хэвээр үлдэж, бусад сурагчийн байрыг ч эзэлэхгүй.
            const invalidDocs = allResultsSnap.docs.filter(d => d.data().invalidatedByViolation === true);
            const validDocs = allResultsSnap.docs.filter(d => d.data().invalidatedByViolation !== true);
            const totalParticipants = validDocs.length;

            const resultsData = validDocs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    score: data.score as number,
                    timeTaken: data.timeTaken as number | undefined,
                    rank: data.rank as number | null,
                    totalParticipants: data.totalParticipants as number | undefined,
                };
            });

            // Sort: highest score first, then lowest timeTaken
            resultsData.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return (a.timeTaken || 999999) - (b.timeTaken || 999999);
            });

            // FIX 26: Collect updates first then commit in chunks of <=400 ops to stay
            // well below Firestore's 500-op batch limit even for large exams.
            const updates: { ref: FirebaseFirestore.DocumentReference; data: { rank: number | null; totalParticipants: number } }[] = [];
            invalidDocs.forEach(d => {
                if (d.data().rank !== null) {
                    updates.push({ ref: d.ref, data: { rank: null, totalParticipants } });
                }
            });
            resultsData.forEach((res, i) => {
                const newRank = i + 1;
                if (res.rank !== newRank || res.totalParticipants !== totalParticipants) {
                    updates.push({
                        ref: adminDb.collection("exam_results").doc(res.id),
                        data: { rank: newRank, totalParticipants },
                    });
                }
            });
            const CHUNK = 400;
            for (let i = 0; i < updates.length; i += CHUNK) {
                const slice = updates.slice(i, i + CHUNK);
                const batch = adminDb.batch();
                slice.forEach(({ ref, data }) => batch.update(ref, data));
                await batch.commit();
            }
        };

        // Fire and forget - don't await
        recalculateRanks(examId).catch(err => {
            console.error('[submit] Rank recalculation failed:', err);
        });

        return NextResponse.json({ success: true, score, percentage, passed, invalidatedByViolation });
    } catch (error: unknown) {
        console.error("Submission error:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
    }
}
