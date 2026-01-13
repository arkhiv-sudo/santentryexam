"use client";

import { useState, useRef } from "react";
import JSZip from "jszip";
import Papa from "papaparse";
import { Question, QuestionType, Subject } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
    Download,
    Upload,
    X,
    Save,
    FileArchive,
    AlertCircle,
    CheckCircle2,
    Trash2,
    ImageIcon,
    Loader2,
    Eye
} from "lucide-react";
import { QuestionPreviewModal } from "./exam/QuestionPreviewModal";
import QuestionPreview from "./exam/QuestionPreview";
import { toast } from "sonner";
import { UploadService } from "@/lib/services/upload-service";
import { QuestionService } from "@/lib/services/question-service";
import { useAuth } from "@/components/AuthProvider";
import imageCompression from "browser-image-compression";

interface BulkQuestionUploadProps {
    allSubjects: Subject[];
    onComplete: () => void;
}

interface PendingQuestion extends Omit<Question, "id"> {
    tempId: string;
    imageFile?: File;
    solutionImageFile?: File;
    imagePreview?: string;
    solutionImagePreview?: string;
    error?: string;
}

const GRADES_MAP: Record<string, string> = {
    "1": "1-р анги", "2": "2-р анги", "3": "3-р анги", "4": "4-р анги",
    "5": "5-р анги", "6": "6-р анги", "7": "7-р анги", "8": "8-р анги",
    "9": "9-р анги", "10": "10-р анги", "11": "11-р анги", "12": "12-р анги"
};
const GRADES_LIST = Object.entries(GRADES_MAP).map(([id, name]) => ({ id, name }));

const COMPRESSION_OPTIONS = {
    maxSizeMB: 0.2, // 200KB
    maxWidthOrHeight: 1200,
    useWebWorker: true
};

export function BulkQuestionUpload({ allSubjects, onComplete }: BulkQuestionUploadProps) {
    const { user } = useAuth();
    const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [previewQuestion, setPreviewQuestion] = useState<PendingQuestion | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const downloadTemplate = async () => {
        const headers = [
            "Асуулт", "Төрөл (multiple_choice эсвэл input)", "Зөв хариулт", "Оноо", "Анги", "Сэдэв", "Асуултын зураг", "Бодолт", "Бодолтын зураг",
            "А", "А-Зураг", "Б", "Б-Зураг", "В", "В-Зураг", "Г", "Г-Зураг", "Д", "Д-Зураг"
        ];
        const exampleData = [
            [
                "Гурвалжны дотоод өнцгүүдийн нийлбэр хэд вэ?",
                "multiple_choice",
                "180",
                "1",
                "6",
                "math_id",
                "triangle.png",
                "Гурвалжны өнцгүүдийг нэмэхэд 180 гардаг.",
                "solution.png",
                "90", "", "180", "", "270", "", "360", "", "", ""
            ],
            [
                "х + 5 = 12 бол х-ийн утгыг ол?",
                "input",
                "7",
                "1",
                "6",
                "math_id",
                "",
                "12 - 5 = 7",
                "",
                "", "", "", "", "", "", "", "", "", ""
            ]
        ];

        const csvContent = "\uFEFF" + Papa.unparse({
            fields: headers,
            data: exampleData
        });

        try {
            const zip = new JSZip();
            zip.file("questions.csv", csvContent);
            zip.folder("images"); // Create empty images folder

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.setAttribute("download", "questions_template.zip");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("Загвар ZIP файлыг бэлдлээ");
        } catch (error) {
            console.error("Failed to generate zip template", error);
            toast.error("Загвар файлыг бэлдэхэд алдаа гарлаа");
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith(".zip")) {
            toast.error("Зөвхөн ZIP файл сонгоно уу");
            return;
        }

        setLoading(true);
        try {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);

            // Build index for O(1) lookup
            const fileIndex: Record<string, string> = {};
            Object.keys(contents.files).forEach(path => {
                const name = path.split('/').pop()?.toLowerCase();
                if (name) fileIndex[name] = path;
            });

            // Look for CSV file
            const csvFile = Object.keys(contents.files).find(name => name.endsWith(".csv"));
            if (!csvFile) {
                toast.error("ZIP файл дотор .csv файл олдсонгүй");
                setLoading(false);
                return;
            }

            const csvText = await contents.files[csvFile].async("string");
            const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

            if (parsed.errors.length > 0) {
                console.error("CSV Parsing errors:", parsed.errors);
                toast.error("CSV файлыг уншихад алдаа гарлаа");
                setLoading(false);
                return;
            }

            const newPending: PendingQuestion[] = [];

            const zipCache = new Map<string, { file: File, preview: string }>();

            for (const row of parsed.data as any[]) {
                const tempId = Math.random().toString(36).substr(2, 9);

                try {
                    // Content & Basic Fields (Trimmed)
                    const content = (row["Асуулт"] || row.Content || row.content || "").trim();
                    const type = (row["Төрөл (multiple_choice эсвэл input)"] || row["Төрөл"] || row.Type || row.type || "multiple_choice").trim() as QuestionType;
                    const correctAnswer = (row["Зөв хариулт"] || row.CorrectAnswer || row.correct_answer || "").trim();
                    const pointsStr = (row["Оноо"] || row.Points || row.points || "1").toString().trim();
                    const points = parseFloat(pointsStr);
                    // Smart Mapping: Grade
                    let grade = (row["Анги"] || row.Grade || row.grade || "").toString().trim();
                    const gradeMatch = grade.match(/\d+/); // Extract first number
                    if (gradeMatch) {
                        const num = gradeMatch[0];
                        if (parseInt(num) >= 1 && parseInt(num) <= 12) {
                            grade = num;
                        }
                    }

                    // Smart Mapping: Subject
                    let subject = (row["Сэдэв"] || row.Subject || row.subject || "").toString().trim();
                    // If it's not a valid ID (assuming IDs don't have spaces and are usually lowercase/alphanumeric)
                    // we try to find a subect with matching name
                    const foundSubject = allSubjects.find(s =>
                        s.id === subject ||
                        s.name.toLowerCase() === subject.toLowerCase() ||
                        s.name.toLowerCase().includes(subject.toLowerCase())
                    );
                    if (foundSubject) {
                        subject = foundSubject.id;
                        // If grade was empty, we can infer it from subject if possible
                        if (!grade && foundSubject.gradeId) grade = foundSubject.gradeId;
                    }

                    const solutionText = (row["Бодолт"] || row.Solution || row.solution || "").trim();

                    // Validation
                    if (!content) throw new Error("Асуултын агуулга хоосон байна");
                    if (!correctAnswer) throw new Error("Зөв хариулт хоосон байна");
                    if (isNaN(points)) throw new Error("Оноо тоо байх ёстой");
                    if (type !== 'multiple_choice' && type !== 'input') throw new Error("Төрөл буруу байна (multiple_choice эсвэл input)");

                    // Image matching
                    const imageName = (row["Асуултын зураг"] || row.ImageName || row.image || "").toLowerCase().trim();
                    const solutionImageName = (row["Бодолтын зураг"] || row.SolutionImageName || row.solution_image || "").toLowerCase().trim();

                    let imageFile: File | undefined;
                    let imagePreview: string | undefined;
                    let solutionImageFile: File | undefined;
                    let solutionImagePreview: string | undefined;

                    // Match images using pre-built index and CACHE
                    const getFileFromZip = async (name: string, label: string) => {
                        if (!name) return undefined;

                        // 1. Check local zip session cache
                        if (zipCache.has(name)) {
                            return zipCache.get(name);
                        }

                        if (!fileIndex[name]) throw new Error(`'${name}' зураг (${label}) ZIP дотор олдсонгүй`);
                        const blob = await contents.files[fileIndex[name]].async("blob");
                        const ext = name.split('.').pop()?.toLowerCase();
                        const mimeType = blob.type || (ext === 'png' ? 'image/png' : 'image/jpeg');
                        if (!mimeType.startsWith('image/')) throw new Error(`'${name}' нь зураг биш байна`);

                        const result = {
                            file: new File([blob], name, { type: mimeType }),
                            preview: URL.createObjectURL(blob)
                        };

                        // 2. Add to cache
                        zipCache.set(name, result);
                        return result;
                    };

                    if (imageName) {
                        const res = await getFileFromZip(imageName, "Асуултын зураг");
                        if (res) { imageFile = res.file; imagePreview = res.preview; }
                    }

                    if (solutionImageName) {
                        const res = await getFileFromZip(solutionImageName, "Бодолтын зураг");
                        if (res) { solutionImageFile = res.file; solutionImagePreview = res.preview; }
                    }

                    // Options & Option Images (A to Д)
                    const options: string[] = [];
                    const optionImages: string[] = [];
                    const optionImageFiles: (File | undefined)[] = [];

                    const optionMapping = [
                        { label: "А", imgLabel: "А-Зураг" },
                        { label: "Б", imgLabel: "Б-Зураг" },
                        { label: "В", imgLabel: "В-Зураг" },
                        { label: "Г", imgLabel: "Г-Зураг" },
                        { label: "Д", imgLabel: "Д-Зураг" }
                    ];

                    for (let i = 0; i < optionMapping.length; i++) {
                        const m = optionMapping[i];
                        const optText = row[m.label];
                        const optImgName = (row[m.imgLabel] || "").toLowerCase();

                        if (optText || optImgName) {
                            options.push(optText || "");

                            if (optImgName) {
                                const res = await getFileFromZip(optImgName, `Сонголт ${m.label}-ийн зураг`);
                                if (res) {
                                    optionImageFiles[i] = res.file;
                                    optionImages[i] = res.preview;
                                } else {
                                    optionImages[i] = "";
                                }
                            } else {
                                optionImages[i] = "";
                            }
                        }
                    }

                    // Multiple choice validation
                    if (type === 'multiple_choice') {
                        if (options.length === 0) throw new Error("Сонголттой асуултад дор хаяж нэг сонголт байх ёстой");
                        const alphabetAnswers = ['А', 'Б', 'В', 'Г', 'Д'];
                        const isMappedAnswer = alphabetAnswers.includes(correctAnswer.toUpperCase());

                        if (isMappedAnswer) {
                            // If correct answer is A, B, C... check if that option exists
                            const idx = alphabetAnswers.indexOf(correctAnswer.toUpperCase());
                            if (!options[idx] && !optionImages[idx]) {
                                throw new Error(`Зөв хариулт '${correctAnswer}' гэж заасан боловч уг сонголт хоосон байна`);
                            }
                        } else {
                            // Check if text matches any option text
                            const match = options.find(o => o === correctAnswer);
                            if (!match) throw new Error(`Зөв хариулт '${correctAnswer}' нь сонголтуудын аль нэгтэй таарахгүй байна`);
                        }
                    }

                    newPending.push({
                        tempId,
                        content,
                        type,
                        options,
                        optionImages: optionImages.filter((_, i) => i < options.length),
                        correctAnswer,
                        points,
                        grade,
                        subject,
                        solution: solutionText,
                        mediaType: imageFile ? "image" : undefined,
                        solutionMediaType: solutionImageFile ? "image" : undefined,
                        imageFile,
                        imagePreview,
                        solutionImageFile,
                        solutionImagePreview,
                        ...(optionImageFiles.length > 0 ? { _optionImageFiles: optionImageFiles } : {}),
                        createdBy: user?.uid || ""
                    } as any);

                } catch (err: any) {
                    // Catch validation or processing errors for this specific row
                    console.error(`Row processing error:`, err);
                    newPending.push({
                        tempId,
                        content: row["Асуулт"] || "",
                        type: "multiple_choice",
                        options: [],
                        optionImages: [],
                        correctAnswer: row["Зөв хариулт"] || "",
                        points: 1,
                        grade: row["Анги"] || "",
                        subject: row["Сэдэв"] || "",
                        solution: row["Бодолт"] || "",
                        error: err.message || "Мэдээлэл боловсруулахад алдаа гарлаа",
                        createdBy: user?.uid || ""
                    } as any);
                }
            }

            setPendingQuestions(prev => [...prev, ...newPending]);
            toast.success(`${newPending.length} асуулт ачааллаа. Шалгаад хадгална уу.`);
        } catch (error) {
            console.error("Bulk upload error:", error);
            toast.error("Файлыг задлахад алдаа гарлаа");
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const updateQuestion = (tempId: string, updates: Partial<PendingQuestion>) => {
        setPendingQuestions(prev => prev.map(q => q.tempId === tempId ? { ...q, ...updates } : q));
    };

    const removeQuestion = (tempId: string) => {
        setPendingQuestions(prev => prev.filter(q => q.tempId !== tempId));
    };


    const handleSaveAll = async () => {
        if (!user) {
            toast.error("Та нэвтэрсэн байх шаардлагатай");
            return;
        }

        const validQuestions = pendingQuestions.filter(q => q.content && q.correctAnswer && !q.error);
        if (validQuestions.length === 0) {
            toast.error("Хадгалах боломжтой зөв асуулт олдсонгүй");
            return;
        }

        setSaving(true);
        setProgress({ current: 0, total: validQuestions.length });

        try {
            const finalQuestions: Omit<Question, "id">[] = [];
            const CONCURRENCY = 5;
            const chunks = [];

            // Map to track unique image hashes and their uploaded URLs (Promise based to avoid race conditions)
            const uploadCache = new Map<string, Promise<string>>();

            for (let i = 0; i < validQuestions.length; i += CONCURRENCY) {
                chunks.push(validQuestions.slice(i, i + CONCURRENCY));
            }

            let processedCount = 0;

            for (const chunk of chunks) {
                try {
                    const results = await Promise.all(chunk.map(async (q) => {
                        let mediaUrl = q.mediaUrl || "";
                        let solutionMediaUrl = q.solutionMediaUrl || "";

                        // Helper for deduplicated upload with race condition protection
                        const uploadWithDeduplication = async (file: File) => {
                            const hash = await UploadService.calculateHash(file);

                            // 1. Check local session cache (O(1)) - prevent uploading same file multiple times in one batch
                            if (uploadCache.has(hash)) {
                                return uploadCache.get(hash)!;
                            }

                            // 2. Create a promise for this upload to "lock" it for others
                            const uploadPromise = UploadService.uploadImageDeduplicated(file);

                            uploadCache.set(hash, uploadPromise);
                            return uploadPromise;
                        };

                        // Compress and Upload main image with deduplication
                        if (q.imageFile) {
                            mediaUrl = await uploadWithDeduplication(q.imageFile);
                        }

                        // Compress and Upload solution image with deduplication
                        if (q.solutionImageFile) {
                            solutionMediaUrl = await uploadWithDeduplication(q.solutionImageFile);
                        }

                        // Handle Option Images
                        const optionImages = [...(q.optionImages || [])];
                        const optionImageFiles = (q as any)._optionImageFiles as (File | undefined)[] || [];

                        for (let i = 0; i < optionImageFiles.length; i++) {
                            if (optionImageFiles[i]) {
                                const url = await uploadWithDeduplication(optionImageFiles[i]!);
                                optionImages[i] = url;
                            }
                        }

                        const { tempId, imageFile, solutionImageFile, imagePreview, solutionImagePreview, error, _optionImageFiles, ...questionData } = q as any;
                        return {
                            ...questionData,
                            mediaUrl,
                            solutionMediaUrl,
                            optionImages,
                            createdBy: user.uid
                        };
                    }));

                    // Save this chunk
                    await QuestionService.createQuestionsBatch(results as any);

                    // Success: remove these from pending immediately
                    const savedIds = chunk.map(c => (c as any).tempId);
                    setPendingQuestions(prev => prev.filter(p => !savedIds.includes(p.tempId)));

                    processedCount += chunk.length;
                    setProgress({ current: processedCount, total: validQuestions.length });
                } catch (chunkError: any) {
                    console.error("Chunk save error:", chunkError);
                    // Mark items in this chunk as failed
                    const chunkIds = chunk.map(c => (c as any).tempId);
                    setPendingQuestions(prev => prev.map(p =>
                        chunkIds.includes(p.tempId)
                            ? { ...p, error: "Хадгалахад алдаа гарлаа. Дахин оролдоно уу." }
                            : p
                    ));
                    // Even if chunk failed, we count it as processed to show progress, but it stays in list
                    processedCount += chunk.length;
                    setProgress({ current: processedCount, total: validQuestions.length });
                }
            }

            toast.success("Бүх асуулт амжилттай хадгалагдлаа");
            if (onComplete) onComplete();
        } catch (error) {
            console.error("Batch save error:", error);
            toast.error("Хадгалахад алдаа гарлаа");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
                <Card className="border-dashed border-2 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <CardContent className="flex flex-col items-center justify-center py-10 space-y-4">
                        <div className="p-4 bg-blue-100 rounded-full">
                            <FileArchive className="w-8 h-8 text-blue-600" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-slate-800">ZIP файл оруулах</p>
                            <p className="text-xs text-slate-500 mt-1">CSV болон зургуудыг агуулсан байна</p>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".zip"
                            onChange={handleFileUpload}
                            disabled={loading || saving}
                        />
                        {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                    </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white">
                    <CardContent className="flex flex-col items-center justify-center py-10 space-y-4">
                        <div className="p-4 bg-emerald-100 rounded-full">
                            <Download className="w-8 h-8 text-emerald-600" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-slate-800">Загвар татах</p>
                            <p className="text-xs text-slate-500 mt-1">CSV файлын бүтцийг харах</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={downloadTemplate} className="mt-2">
                            Загвар (CSV)
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {pendingQuestions.length > 0 && (
                <Card className="border-blue-200 shadow-lg overflow-hidden">
                    <CardHeader className="bg-blue-600 text-white flex flex-row items-center justify-between py-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5" />
                            <CardTitle className="text-lg">Оруулахад бэлэн ({pendingQuestions.length})</CardTitle>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="bg-white text-blue-600 hover:bg-blue-50"
                                onClick={handleSaveAll}
                                disabled={saving}
                            >
                                {saving ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {progress.current}/{progress.total}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Save className="w-4 h-4" />
                                        Бүгдийг хадгалах
                                    </span>
                                )}
                            </Button>
                            {pendingQuestions.some(q => q.error) && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                                    onClick={() => setPendingQuestions(prev => prev.filter(q => !q.error))}
                                    disabled={saving}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Алдаатайг арилгах
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                onClick={() => setPendingQuestions([])}
                                disabled={saving}
                            >
                                <X className="w-4 h-4 mr-2" />
                                Бүгдийг арилгах
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[600px] overflow-y-auto">
                        <div className="divide-y divide-slate-200">
                            {pendingQuestions.map((q, idx) => (
                                <div key={q.tempId} className={`p-6 transition-colors group ${q.error ? 'bg-red-50/50 hover:bg-red-50' : 'bg-white hover:bg-slate-50/50'}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400"># {idx + 1}</span>
                                            {q.error && (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold animate-pulse">
                                                    <AlertCircle className="w-3 h-3" />
                                                    {q.error}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setPreviewQuestion(q)}
                                                className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                                                title="Урьдчилан харах"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => removeQuestion(q.tempId)} className="text-slate-300 hover:text-red-600 transition-colors p-1">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid lg:grid-cols-2 gap-8">
                                        {/* Left Side: Inputs */}
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Төрөл</label>
                                                    <Select
                                                        value={q.type}
                                                        onChange={(e) => updateQuestion(q.tempId, { type: e.target.value as QuestionType })}
                                                        className="text-xs h-9"
                                                    >
                                                        <option value="multiple_choice">Сонгох</option>
                                                        <option value="input">Хариулах</option>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Оноо</label>
                                                    <Input
                                                        type="number"
                                                        className="h-9"
                                                        value={q.points}
                                                        onChange={(e) => updateQuestion(q.tempId, { points: parseFloat(e.target.value) })}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Асуултын агуулга</label>
                                                <textarea
                                                    className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                    value={q.content}
                                                    onChange={(e) => updateQuestion(q.tempId, { content: e.target.value })}
                                                    placeholder="Асуултаа энд бичнэ үү..."
                                                />
                                            </div>

                                            {q.type === 'multiple_choice' && (
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase block">Сонголтууд (хамгийн ихдээ 5)</label>
                                                    <div className="grid gap-2">
                                                        {[0, 1, 2, 3, 4].map((optIdx) => (
                                                            <div key={optIdx} className="flex gap-2">
                                                                <div className="relative flex-1">
                                                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-100 rounded text-[9px] font-bold flex items-center justify-center text-slate-500">
                                                                        {String.fromCharCode(65 + optIdx)}
                                                                    </div>
                                                                    <Input
                                                                        className="pl-9 h-9 text-xs"
                                                                        value={q.options?.[optIdx] || ""}
                                                                        onChange={(e) => {
                                                                            const newOptions = [...(q.options || [])];
                                                                            // Ensure length
                                                                            while (newOptions.length <= optIdx) newOptions.push("");
                                                                            newOptions[optIdx] = e.target.value;
                                                                            updateQuestion(q.tempId, { options: newOptions.filter((o, idx) => o !== "" || idx < newOptions.length - 1) });
                                                                        }}
                                                                        placeholder={`Сонголт ${String.fromCharCode(65 + optIdx)}`}
                                                                    />
                                                                </div>
                                                                {q.optionImages?.[optIdx] && (
                                                                    <div className="w-9 h-9 border border-slate-200 rounded overflow-hidden shrink-0">
                                                                        <img src={q.optionImages[optIdx]} className="w-full h-full object-cover" alt="Option" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Зөв хариулт</label>
                                                <Input
                                                    className="mt-1 border-slate-200"
                                                    value={q.correctAnswer}
                                                    onChange={(e) => updateQuestion(q.tempId, { correctAnswer: e.target.value })}
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Анги</label>
                                                    <Select
                                                        value={q.grade}
                                                        onChange={(e) => updateQuestion(q.tempId, { grade: e.target.value })}
                                                        className="text-xs h-9"
                                                    >
                                                        <option value="">Сонгох...</option>
                                                        {GRADES_LIST.map(g => (
                                                            <option key={g.id} value={g.id}>{g.name}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Сэдэв</label>
                                                    <Select
                                                        value={q.subject}
                                                        onChange={(e) => updateQuestion(q.tempId, { subject: e.target.value })}
                                                        className="text-xs h-9"
                                                    >
                                                        <option value="">Сонгох...</option>
                                                        {allSubjects.filter(s => !q.grade || s.gradeId === q.grade).map(s => (
                                                            <option key={s.id} value={s.id}>{s.name}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Бодолт (Текст)</label>
                                                <textarea
                                                    className="w-full mt-1 p-3 border border-slate-200 rounded-xl text-sm min-h-[60px] focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                    value={q.solution}
                                                    onChange={(e) => updateQuestion(q.tempId, { solution: e.target.value })}
                                                    placeholder="Бодолтын тайлбар..."
                                                />
                                            </div>
                                        </div>

                                        {/* Right Side: Preview */}
                                        <div className="space-y-4">
                                            <div className="h-[400px]">
                                                <QuestionPreview
                                                    question={{
                                                        ...q,
                                                        mediaUrl: q.imagePreview,
                                                        solutionMediaUrl: q.solutionImagePreview
                                                    }}
                                                    className="!rounded-xl border-dashed"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <QuestionPreviewModal
                isOpen={!!previewQuestion}
                onClose={() => setPreviewQuestion(null)}
                question={previewQuestion || {}}
            />
        </div>
    );
}
