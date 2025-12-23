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
    duration: number; // minutes
    status: 'draft' | 'published' | 'archived';
    createdBy: string;
    questionIds: string[]; // IDs of questions included in this exam
}

export type QuestionType = 'multiple_choice' | 'text' | 'fill_in_the_blank' | 'listening';

export interface Question {
    id: string;
    type: QuestionType;
    content: string;
    options?: string[]; // For multiple choice
    correctAnswer: string;
    mediaUrl?: string; // URL of the media
    mediaType?: 'image' | 'audio' | 'video';
    points?: number;
    category?: string;
}
