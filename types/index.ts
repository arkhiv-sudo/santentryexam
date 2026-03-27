export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface UserProfile {
    uid: string;
    email: string;
    parentEmail?: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    studentCode?: string;
    school?: string;
    class?: string;
    grade?: string; // numeric grade string, e.g. '12' from '12А'
    aimag?: string;
    soum?: string;
    children?: string[]; // UIDs of children (for parents)
    // Guardian fields
    phone?: string;
    emergencyPhone?: string;
    // Student identity
    nationalId?: string;     // РД (Регистрийн дугаар)
    parentId?: string;       // UID of the parent who registered this student
    tempPassword?: string;   // plain-text temp password shown to parent
    status?: "active" | "archived";
}

export interface Exam {
    id: string;
    title: string;
    scheduledAt: Date;
    registrationEndDate: Date;
    duration: number; // minutes
    grade: string; // '1' – '12'
    maxQuestions: number;
    status: 'draft' | 'published' | 'archived' | 'completed';
    createdBy: string;
    questionIds: string[];
    questionSnapshot?: ExamQuestion[]; // embedded at assignment time — no correctAnswer/solution
    subjectDistribution?: { subjectId: string; count: number }[];
    questionsAssigned?: boolean;
    passingScore?: number; // Суурь оноо (босго)
}

export type QuestionType = 'multiple_choice' | 'fill_in_blank' | 'input'; // 'input' kept for backwards compat

export interface Grade {
    id: string;
    name: string;
    order?: number;
}

export interface Lesson {
    id: string;
    name: string;
}

export interface Subject {
    id: string;
    name: string;
    gradeId?: string;
    lessonId?: string; // Ямар хичээлд хамаарах сэдэв
}

export interface Question {
    id: string;
    type: QuestionType;
    content: string;
    options?: string[];
    optionImages?: string[];
    correctAnswer: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'audio' | 'video';
    points: number; // default 1
    subject?: string;
    lessonId?: string;
    grade?: string;
    solution?: string;
    solutionMediaUrl?: string;
    solutionMediaType?: 'image' | 'audio' | 'video';
    createdBy: string;
    createdAt?: string;
    updatedAt?: string;
    status?: 'active' | 'correction_needed' | 'archived';
    correctionNote?: string;
}

// Question served to students during exam (no answers/solutions)
export interface ExamQuestion {
    id: string;
    type: QuestionType;
    content: string;
    options?: string[];
    optionImages?: string[];
    mediaUrl?: string;
    mediaType?: 'image' | 'audio' | 'video';
    points: number;
    subject?: string;
}

export interface Registration {
    id: string;
    studentId: string;
    examId: string;
    status: 'registered' | 'started' | 'completed';
    registeredAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    violations?: number;
    draftAnswers?: Record<string, string>;
    extendedTime?: number; // seconds
    forceSubmitted?: boolean;
    ipAddress?: string;
}

export interface Submission {
    id: string;
    examId: string;
    studentId: string;
    studentName: string;
    answers: Record<string, string>; // questionId -> student answer
    submittedAt: Date;
    score?: number;
    maxScore?: number;
    percentage?: number;
    graded?: boolean;
    gradedAt?: Date;
    timeTaken?: number; // seconds
    gradedAnswers?: Record<string, GradedAnswer>;
}

export interface GradedAnswer {
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    points: number;
    earnedPoints: number;
}

export interface ExamResult {
    id: string;
    submissionId: string;
    examId: string;
    examTitle: string;
    studentId: string;
    studentName: string;
    score: number;
    maxScore: number;
    percentage: number;
    gradedAt: Date;
    rank?: number;             // Эрэмбэ (зөвхөн тэнцсэн)
    passed?: boolean;          // Тэнцсэн эсэх
    totalParticipants?: number;
    passingScore?: number;
}

export interface Correction {
    id: string;
    questionId: string;
    questionContent: string;
    submittedBy: string; // teacher uid
    submittedByName: string;
    note: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: Date;
    resolvedAt?: Date;
    resolvedBy?: string;
}

export interface Notification {
    id: string;
    type: 'exam_started' | 'exam_completed' | 'score_available' | 'correction_submitted' | 'correction_approved' | 'correction_rejected';
    recipientId: string; // parent uid
    studentId: string;
    studentName: string;
    examId: string;
    examTitle: string;
    message: string;
    score?: number;
    maxScore?: number;
    percentage?: number;
    read: boolean;
    createdAt: Date;
}

export interface ExamMessage {
    id: string; // usually auto-generated
    senderId: string;
    senderRole: 'student' | 'admin' | 'teacher';
    senderName: string;
    content: string;
    createdAt: Date;
}

export interface ExamTicket {
    id: string;
    examId: string;
    studentId: string;
    studentName: string;
    status: 'open' | 'forwarded_to_teacher' | 'resolved';
    createdAt: Date;
    updatedAt: Date;
    messages: ExamMessage[];
}
