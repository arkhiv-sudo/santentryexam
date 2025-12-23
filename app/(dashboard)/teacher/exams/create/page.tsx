"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import * as XLSX from "xlsx";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { QuestionType } from "@/types";

interface QuestionDraft {
    id: string;
    type: QuestionType;
    content: string;
    options: string[];
    correctAnswer: string;
    category: string;
    mediaMatch?: string; // Filename to match
    mediaUrl?: string; // Uploaded URL
    mediaType?: 'image' | 'audio' | 'video';
    points?: number;
}

export default function CreateExamPage() {
    const { profile } = useAuth();
    const [title, setTitle] = useState("");
    const [duration, setDuration] = useState(60);
    const [questions, setQuestions] = useState<QuestionDraft[]>([]);
    const [mediaFiles, setMediaFiles] = useState<FileList | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: "binary" });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);

            // Parse data to questions
            const parsedQuestions: QuestionDraft[] = data.map((row: any, index) => ({
                id: `q-${index}`,
                type: (row.type as QuestionType) || 'multiple_choice',
                content: row.content || '',
                options: [row.option1, row.option2, row.option3, row.option4].filter(Boolean),
                correctAnswer: row.correctAnswer,
                category: row.category || 'General',
                mediaMatch: row.mediaFilename,
                mediaType: row.mediaType || (row.mediaFilename ? 'image' : undefined), // Default to image if filename exists but type doesn't
                points: row.points || 1
            }));

            setQuestions(parsedQuestions);
        };
        reader.readAsBinaryString(file);
    };

    const uploadFile = async (file: File) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}_${file.name}`;
        const storageRef = ref(storage, `exam-assets/${uniqueName}`);

        try {
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (error) {
            console.error("Upload failed", error);
            throw error;
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // Upload matched media
            const updatedQuestions = [...questions];

            if (mediaFiles) {
                for (let i = 0; i < mediaFiles.length; i++) {
                    const file = mediaFiles[i];
                    const matchIndex = updatedQuestions.findIndex(q => q.mediaMatch === file.name);
                    if (matchIndex !== -1) {
                        // Upload
                        const url = await uploadFile(file);
                        updatedQuestions[matchIndex].mediaUrl = url;
                    }
                }
            }

            // Save Exam
            const examData = {
                title,
                duration,
                scheduledAt: Timestamp.now(), // Default now for draft
                createdBy: profile?.uid,
                status: 'draft',
                questions: updatedQuestions
            };

            await addDoc(collection(db, "exams"), examData);
            toast.success("Шалгалт амжилттай хадгалагдлаа!");
            router.push("/");
        } catch (error) {
            console.error(error);
            toast.error("Шалгалтыг хадгалахад алдаа гарлаа");
        } finally {
            setLoading(false);
        }
    };

    if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
        return <div className="p-8">Хандах эрхгүй</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="mx-auto max-w-4xl space-y-6">
                <h1 className="text-2xl font-bold">Шинэ шалгалт үүсгэх</h1>

                <Card>
                    <CardHeader><CardTitle>Шалгалтын мэдээлэл</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <Input placeholder="Шалгалтын гарчиг" value={title} onChange={e => setTitle(e.target.value)} />
                        <Input type="number" placeholder="Үргэлжлэх хугацаа (минут)" value={duration} onChange={e => setDuration(Number(e.target.value))} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Асуулт оруулах</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">1. Excel файл оруулах (агуулга, сонголт, зөв хариулт, файлын нэр)</label>
                            <Input type="file" accept=".xlsx, .xls" onChange={handleExcelUpload} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">2. Медиа файл оруулах (Excel-д заасан зураг/аудио файлууд)</label>
                            <Input type="file" multiple onChange={(e) => setMediaFiles(e.target.files)} />
                        </div>
                    </CardContent>
                </Card>

                {questions.length > 0 && (
                    <Card>
                        <CardHeader><CardTitle>Урьдчилан харах ба засах ({questions.length} асуулт)</CardTitle></CardHeader>
                        <CardContent>
                            <div className="max-h-96 overflow-y-auto space-y-4">
                                {questions.map((q, i) => (
                                    <div key={q.id} className="p-4 border rounded relative">
                                        <div className="absolute top-2 right-2 flex gap-2">
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setQuestions(questions.filter(_q => _q.id !== q.id))}
                                            >
                                                Устгах
                                            </Button>
                                        </div>

                                        <div className="space-y-3 pr-16">
                                            <div>
                                                <label className="text-xs font-bold text-gray-500 uppercase">Асуултын агуулга</label>
                                                <Input
                                                    value={q.content}
                                                    onChange={(e) => {
                                                        const newQ = [...questions];
                                                        newQ[i].content = e.target.value;
                                                        setQuestions(newQ);
                                                    }}
                                                />
                                            </div>

                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className="text-xs font-bold text-gray-500 uppercase">Асуултын төрөл</label>
                                                    <Select
                                                        value={q.type}
                                                        onChange={(e) => {
                                                            const newQ = [...questions];
                                                            newQ[i].type = e.target.value as QuestionType;
                                                            setQuestions(newQ);
                                                        }}
                                                    >
                                                        <option value="multiple_choice">Сонгох асуулт</option>
                                                        <option value="text">Бичвэр / Эссе</option>
                                                        <option value="fill_in_the_blank">Нөхөх асуулт</option>
                                                        <option value="listening">Сонсох даалгавар</option>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-gray-500 uppercase">Ангилал</label>
                                                    <Input
                                                        value={q.category}
                                                        onChange={(e) => {
                                                            const newQ = [...questions];
                                                            newQ[i].category = e.target.value;
                                                            setQuestions(newQ);
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-gray-500 uppercase">Оноо</label>
                                                    <Input
                                                        type="number"
                                                        value={q.points || 1}
                                                        onChange={(e) => {
                                                            const newQ = [...questions];
                                                            newQ[i].points = Number(e.target.value);
                                                            setQuestions(newQ);
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs font-bold text-gray-500 uppercase">Тохирох медиа (Файлын нэр)</label>
                                                    <Input
                                                        value={q.mediaMatch || ''}
                                                        placeholder="Жишээ: audio1.mp3"
                                                        onChange={(e) => {
                                                            const newQ = [...questions];
                                                            newQ[i].mediaMatch = e.target.value;
                                                            setQuestions(newQ);
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-gray-500 uppercase">Медиа төрөл</label>
                                                    <Select
                                                        value={q.mediaType || 'image'}
                                                        onChange={(e) => {
                                                            const newQ = [...questions];
                                                            newQ[i].mediaType = e.target.value as any;
                                                            setQuestions(newQ);
                                                        }}
                                                    >
                                                        <option value="image">Зураг</option>
                                                        <option value="audio">Аудио</option>
                                                        <option value="video">Видео</option>
                                                    </Select>
                                                </div>
                                            </div>

                                            {/* Options Editing */}
                                            {q.type === 'multiple_choice' && (
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-gray-500 uppercase">Сонголтууд (Зөвийг сонгоно уу)</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {q.options.map((opt, optIdx) => (
                                                            <div key={optIdx} className="flex items-center gap-2">
                                                                <input
                                                                    type="radio"
                                                                    name={`correct-${q.id}`}
                                                                    checked={q.correctAnswer === opt}
                                                                    onChange={() => {
                                                                        const newQ = [...questions];
                                                                        newQ[i].correctAnswer = opt; // Set exact string match
                                                                        setQuestions(newQ);
                                                                    }}
                                                                />
                                                                <Input
                                                                    value={opt}
                                                                    onChange={(e) => {
                                                                        const newQ = [...questions];
                                                                        newQ[i].options[optIdx] = e.target.value;
                                                                        // Update correct answer if it matched the old value
                                                                        if (q.correctAnswer === opt) {
                                                                            newQ[i].correctAnswer = e.target.value;
                                                                        }
                                                                        setQuestions(newQ);
                                                                    }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Button onClick={handleSave} disabled={loading} className="w-full">
                    {loading ? "Файлуудыг ачаалж, хадгалж байна..." : "Шалгалт хадгалах"}
                </Button>
            </div>
        </div>
    );
}
