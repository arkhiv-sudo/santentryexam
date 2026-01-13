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
    aimag?: string;
    soum?: string;
    children?: string[]; // IDs of children (for parents)
}

export interface Exam {
    id: string;
    title: string;
    scheduledAt: Date;
    registrationEndDate: Date;
    duration: number; // minutes
    grade: string;
    maxQuestions: number;
    status: 'draft' | 'published' | 'archived';
    createdBy: string;
    questionIds: string[]; // IDs of questions included in this exam
    subjectDistribution?: { subjectId: string, count: number }[];
}

export type QuestionType = 'multiple_choice' | 'input';

export interface Grade {
    id: string;
    name: string;
    order?: number;
}

export interface Subject {
    id: string;
    name: string;
    gradeId?: string; // Optional: if subject is specific to a grade
}

export interface Question {
    id: string;
    type: QuestionType;
    content: string;
    options?: string[]; // For multiple choice
    optionImages?: string[]; // URLs for option images
    correctAnswer: string;
    mediaUrl?: string; // URL of the media
    mediaType?: 'image' | 'audio' | 'video';
    points?: number;
    category?: string; // This can be used as Topic/Subject
    subject?: string;
    grade?: string;
    solution?: string;
    solutionMediaUrl?: string;
    solutionMediaType?: 'image' | 'audio' | 'video';
    createdBy: string;
    createdAt?: string;
}
