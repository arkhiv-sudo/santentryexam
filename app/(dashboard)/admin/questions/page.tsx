"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { QuestionService } from "@/lib/services/question-service";
import { Question } from "@/types";
import { QuestionType } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Loader2, CheckCircle, XCircle, AlertTriangle, Trash2, Download, Upload } from "lucide-react";
import { SettingsService } from "@/lib/services/settings-service";
import Papa from "papaparse";
import JSZip from "jszip";
import katex from "katex";
import { useAuth } from "@/components/AuthProvider";
import { Subject } from "@/types";
import { Lesson } from "@/types";
import MathRenderer from "@/components/exam/MathRenderer";
import {
    DocumentData,
    QueryDocumentSnapshot,
    collection,
    getDocs,
    query as fsQuery,
    where,
    orderBy,
    updateDoc,
    doc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/providers/ModalProvider";

const PAGE_SIZE = 10;

const GRADES_MAP: Record<string, string> = {
    "1": "1-р анги", "2": "2-р анги", "3": "3-р анги", "4": "4-р анги",
    "5": "5-р анги", "6": "6-р анги", "7": "7-р анги", "8": "8-р анги",
    "9": "9-р анги", "10": "10-р анги", "11": "11-р анги", "12": "12-р анги"
};

interface Correction {
    id: string;
    questionId: string;
    questionContent: string;
    submittedBy: string;
    submittedByName: string;
    note: string;
    status: "pending" | "approved" | "rejected";
    createdAt: { toDate?: () => Date } | null;
}

type PendingQuestion = Omit<Question, "id"> & { tempId: string; imageFile?: Blob; imageUrl?: string };
type InvalidQuestionRow = Record<string, string>;

const validateLatex = (text: string): { isValid: boolean, error?: string } => {
    if (!text) return { isValid: true };
    const mathRegex = /(?:\$\$([\s\S]*?)\$\$)|(?:\$([\s\S]*?)\$)|(?:\\\[([\s\S]*?)\\\])|(?:\\\(([\s\S]*?)\\\))/g;
    let match;
    while ((match = mathRegex.exec(text)) !== null) {
        const mathContent = match[1] ?? match[2] ?? match[3] ?? match[4];
        if (!mathContent) continue;
        try {
            katex.renderToString(mathContent, { 
                throwOnError: true,
                displayMode: !!(match[1] || match[3]) 
            });
        } catch (e: unknown) {
            return { isValid: false, error: e instanceof Error ? e.message : String(e) };
        }
    }
    return { isValid: true };
};

export const validateRow = (
    row: InvalidQuestionRow, 
    subjectsData: Subject[], 
    userId: string,
    imageFilesMap: Map<string, Blob>,
    lessonsData?: { id: string; name: string }[]
): { isValid: boolean, error?: string, validData?: PendingQuestion } => {
    const gradeRaw = row["Анги"]?.trim() || "";
    const lessonRaw = row["Хичээл"]?.trim() || "";
    const subjectRaw = row["Сэдэв"]?.trim() || "";
    const typeRaw = row["Төрөл"]?.trim().toLowerCase() || "";
    const pointsRaw = row["Оноо"]?.trim() || "";
    const content = row["Асуулт"]?.trim() || "";
    const optA = row["Сонголт А"]?.trim() || "";
    const optB = row["Сонголт Б"]?.trim() || "";
    const optC = row["Сонголт В"]?.trim() || "";
    const optD = row["Сонголт Г"]?.trim() || "";
    const answerRaw = row["Зөв хариу"]?.trim() || "";
    const solution = row["Бодолт"]?.trim() || "";
    const imageRaw = row["Зураг"]?.trim() || "";


    let errorReason = "";

    // 1. Grade check
    if (!gradeRaw || !Object.keys(GRADES_MAP).includes(gradeRaw)) {
        errorReason = `Буруу анги ("${gradeRaw}"). 1-12 хооронд байх ёстой.`;
    }

    // 2. Lesson check (Хичээл)
    let filteredSubjects = subjectsData;
    if (lessonsData && lessonsData.length > 0) {
        if (!lessonRaw) {
            errorReason = "Хичээл хоосон байна.";
        } else {
            const foundLesson = lessonsData.find(l => l.name.trim().toLowerCase() === lessonRaw.toLowerCase());
            if (!foundLesson) {
                errorReason = `Бүртгэлгүй хичээл: "${lessonRaw}"`;
            } else {
                // Only search subjects that belong to this lesson
                filteredSubjects = subjectsData.filter((s: Subject) => s.lessonId === foundLesson.id);
            }
        }
    }

    // 3. Subject check (Сэдэв)
    let foundSubject: Subject | undefined;
    if (!errorReason) {
        if (!subjectRaw) {
            errorReason = "Сэдэв хоосон байна.";
        } else {
            foundSubject = filteredSubjects.find((s: Subject) => s.name.trim().toLowerCase() === subjectRaw.toLowerCase());
            if (!foundSubject) {
                const lessonHint = lessonRaw ? ` (${lessonRaw} хичээлд оноогдоогүй байна)` : "";
                errorReason = `Бүртгэлгүй сэдэв: "${subjectRaw}"${lessonHint}`;
            }
        }
    }

    // 3. Question check
    if (!errorReason && !content) {
        errorReason = "Асуулт хоосон байна.";
    }

    // 4. Type check
    let systemType: QuestionType | null = null;
    if (!errorReason) {
        if (!typeRaw) {
            errorReason = "Асуултын төрөл бичээгүй байна.";
        } else if (typeRaw.includes("богино") || typeRaw.includes("хариулах") || typeRaw.includes("input")) {
            systemType = "input";
        } else if (typeRaw.includes("нөхөх") || typeRaw.includes("fill")) {
            systemType = "fill_in_blank";
        } else if (typeRaw.includes("сонгох") || typeRaw.includes("choice") || typeRaw.includes("multiple")) {
            systemType = "multiple_choice";
        } else {
            errorReason = `Асуултын төрөл танигдсангүй: "${typeRaw}"`;
        }
    }

    // 5. Options & Answer check
    let options: string[] | undefined;
    if (!errorReason && systemType === "multiple_choice") {
        options = [optA, optB, optC, optD].filter(o => o !== "");
        if (options.length < 2) {
            errorReason = "Сонгох асуулт хамгийн багадаа 2 сонголттой байх ёстой.";
        }
    }

    if (!errorReason && !answerRaw) {
        errorReason = "Зөв хариу бичээгүй байна.";
    }

    // 6. Points
    const pointsNum = parseInt(pointsRaw);
    if (!errorReason && (isNaN(pointsNum) || pointsNum <= 0)) {
        errorReason = "Оноо буруу (0-ээс их тоо байх ёстой).";
    }

    // 7. LaTeX Validator
    if (!errorReason) {
        const allText = [content, optA, optB, optC, optD, answerRaw, solution].filter(Boolean).join("\n\n");
        const latexCheck = validateLatex(allText);
        if (!latexCheck.isValid) {
            errorReason = `LaTeX алдаа: ${latexCheck.error}`;
        }
    }

    // 8. Image validation
    let parsedImage: Blob | undefined;
    if (!errorReason && imageRaw) {
        let foundImage = imageFilesMap.get(imageRaw) || imageFilesMap.get(`images/${imageRaw}`) || imageFilesMap.get(`questions/images/${imageRaw}`);
        if (!foundImage) {
            // Fuzzy search by filename ending
            for (const [path, blob] of imageFilesMap.entries()) {
                if (path.endsWith("/" + imageRaw) || path === imageRaw) {
                    foundImage = blob;
                    break;
                }
            }
        }
        if (!foundImage) {
            errorReason = `Зураг олдсонгүй: "${imageRaw}". ZIP файлын images/ хавтаст байхгүй байна.`;
        } else {
            parsedImage = foundImage;
        }
    }

    // If any error exists, push to invalid and return early
    if (errorReason || !foundSubject || !systemType) {
        return { isValid: false, error: errorReason || "Үл мэдэгдэх алдаа" };
    }

    return {
        isValid: true,
        validData: {
            tempId: Math.random().toString(36).substring(7),
            content,
            grade: gradeRaw,
            subject: foundSubject.id,
            type: systemType,
            points: pointsNum,
            options,
            correctAnswer: answerRaw,
            solution,
            ...(parsedImage ? { imageFile: parsedImage } : {}),
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    };
};

export default function QuestionsPage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = useState<"questions" | "corrections">("questions");
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
    const [gradeFilter, setGradeFilter] = useState<string | "all">("all");
    const [subjectFilter, setSubjectFilter] = useState<string | "all">("all");
    const [authorFilter, setAuthorFilter] = useState<string | "all">("all");
    const [currentPage, setCurrentPage] = useState(0);
    const [lastVisibleDocs, setLastVisibleDocs] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    // Bulk upload states
    const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
    const [invalidQuestions, setInvalidQuestions] = useState<InvalidQuestionRow[]>([]);
    const [isSavingBulk, setIsSavingBulk] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Inline edit states
    const [editingTempId, setEditingTempId] = useState<string | null>(null);
    const [editRowData, setEditRowData] = useState<InvalidQuestionRow | null>(null);
    const [parsedImageFiles, setParsedImageFiles] = useState<Map<string, Blob>>(new Map());

    const handleSaveInvalidEdit = () => {
        if (!editRowData || !editingTempId) return;
        const result = validateRow(editRowData, subjectsData, user?.uid || "admin", parsedImageFiles);
        
        if (!result.isValid) {
            setEditRowData({ ...editRowData, "Алдааны шалтгаан": result.error || "Алдаа" });
            setInvalidQuestions(prev => prev.map(r => r._tempId === editingTempId ? { ...editRowData, "Алдааны шалтгаан": result.error || "Алдаа" } : r));
            toast.error("Алдаатай хэвээр байна: " + result.error);
        } else {
            setPendingQuestions(prev => [...prev, result.validData!]);
            setInvalidQuestions(prev => prev.filter(r => r._tempId !== editingTempId));
            setEditingTempId(null);
            setEditRowData(null);
            toast.success("Асуулт амжилттай засагдаж ногоон хүснэгт рүү шилжлээ!");
        }
    };

    const cancelEdit = () => {
        setEditingTempId(null);
        setEditRowData(null);
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Fetch Authors with Caching (1 hour stable)
    const { data: authors = [] } = useQuery({
        queryKey: ["authors_list"],
        queryFn: () => QuestionService.getUsersByRoles(["admin", "teacher"]),
        staleTime: 60 * 60 * 1000,
    });

    // Reset pagination when filter changes
    useEffect(() => {
        setCurrentPage(0);
        setLastVisibleDocs([]);
    }, [typeFilter, gradeFilter, subjectFilter, authorFilter]);

    const router = useRouter();

    // Fetch Subjects with Caching
    const [editLessonId, setEditLessonId] = useState<string>("");
    const { data: subjectsData = [] } = useQuery({
        queryKey: ["subjects_list"],
        queryFn: () => SettingsService.getSubjects(),
        staleTime: 60 * 60 * 1000,
    });

    const { data: lessonsData = [] } = useQuery<Lesson[]>({
        queryKey: ["lessons"],
        queryFn: () => SettingsService.getLessons(),
        staleTime: 30 * 60 * 1000,
    });


    const subjectsMap = useMemo(() => {
        const sMap: Record<string, string> = {};
        subjectsData.forEach((s: Subject) => sMap[s.id] = s.name);
        return sMap;
    }, [subjectsData]);

    const lessonsMap = useMemo(() => {
        const lMap: Record<string, string> = {};
        lessonsData.forEach((l: Lesson) => lMap[l.id] = l.name);
        return lMap;
    }, [lessonsData]);

    // Lesson name from a subject id
    const getLessonNameForSubject = (subjectId: string): string => {
        const subject = subjectsData.find((s: Subject) => s.id === subjectId);
        if (!subject?.lessonId) return "";
        return lessonsMap[subject.lessonId] || "";
    };

    // Subjects filtered by selected edit lesson
    const editSubjectsFiltered = useMemo(() => {
        if (!editLessonId) return subjectsData;
        return subjectsData.filter((s: Subject) => s.lessonId === editLessonId);
    }, [subjectsData, editLessonId]);

    const filteredSubjects = useMemo(() => {
        return subjectsData.filter((s: Subject) => !s.gradeId || s.gradeId === gradeFilter);
    }, [subjectsData, gradeFilter]);

    // Fetch Questions with Pagination & Caching
    const {
        data: paginatedData,
        isLoading: loading,
        isFetching,
        isError,
        error
    } = useQuery({
        queryKey: ["admin_questions", typeFilter, gradeFilter, subjectFilter, authorFilter, currentPage],
        queryFn: async () => {
            const lastDoc = currentPage === 0 ? undefined : lastVisibleDocs[currentPage - 1];
            return await QuestionService.getQuestionsPaginated(
                PAGE_SIZE,
                lastDoc || undefined,
                typeFilter,
                subjectFilter,
                gradeFilter,
                authorFilter
            );
        },
        staleTime: 15 * 60 * 1000,
        placeholderData: (previousData) => previousData,
    });

    useEffect(() => {
        if (paginatedData?.lastVisible) {
            setLastVisibleDocs(prev => {
                if (prev[currentPage] === paginatedData.lastVisible) return prev;
                const next = [...prev];
                next[currentPage] = paginatedData.lastVisible;
                return next;
            });
        }
    }, [paginatedData?.lastVisible, currentPage]);

    // Fetch pending corrections
    const { data: corrections = [], isLoading: correctionsLoading } = useQuery({
        queryKey: ["admin_corrections"],
        queryFn: async () => {
            const q = fsQuery(
                collection(db, "corrections"),
                where("status", "==", "pending"),
                orderBy("createdAt", "desc")
            );
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as Correction));
        },
        staleTime: 2 * 60 * 1000,
    });

    const questions = paginatedData?.questions || [];
    const totalCount = paginatedData?.totalCount || 0;
    const hasNext = !!paginatedData?.lastVisible && (currentPage + 1) * PAGE_SIZE < totalCount;

    // Prefetch next page
    useEffect(() => {
        if (hasNext) {
            const nextPage = currentPage + 1;
            const lastDoc = paginatedData?.lastVisible;
            queryClient.prefetchQuery({
                queryKey: ["admin_questions", typeFilter, gradeFilter, subjectFilter, authorFilter, nextPage],
                queryFn: () => QuestionService.getQuestionsPaginated(
                    PAGE_SIZE,
                    lastDoc || undefined,
                    typeFilter,
                    subjectFilter,
                    gradeFilter,
                    authorFilter
                ),
            });
        }
    }, [hasNext, currentPage, paginatedData?.lastVisible, queryClient, typeFilter, gradeFilter, subjectFilter, authorFilter]);

    const displayQuestions = useMemo(() => {
        const currentQuestions = paginatedData?.questions || [];
        if (!searchTerm) return currentQuestions;
        const lowerTerm = searchTerm.toLowerCase();
        return currentQuestions.filter(q =>
            q.content.toLowerCase().includes(lowerTerm) ||
            (q.subject && subjectsMap[q.subject]?.toLowerCase().includes(lowerTerm))
        );
    }, [searchTerm, paginatedData?.questions, subjectsMap]);

    const isAllSelected = displayQuestions.length > 0 && displayQuestions.every(q => selectedIds.has(q.id));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                displayQuestions.forEach(q => next.delete(q.id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                displayQuestions.forEach(q => next.add(q.id));
                return next;
            });
        }
    };

    const handleNext = () => { if (hasNext) setCurrentPage(prev => prev + 1); };
    const handlePrev = () => { if (currentPage > 0) setCurrentPage(prev => prev - 1); };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: "Устгахыг баталгаажуулах",
            message: "Та энэ асуултыг устгахдаа итгэлтэй байна уу?",
            confirmLabel: "Устгах",
            variant: "destructive"
        });
        if (!confirmed) return;
        try {
            await QuestionService.deleteQuestion(id);
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
            toast.success("Асуулт амжилттай устгагдлаа");
        } catch {
            toast.error("Асуултыг устгахад алдаа гарлаа");
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const confirmed = await confirm({
            title: `${selectedIds.size} асуулт устгах`,
            message: `Та сонгосон ${selectedIds.size} асуултыг устгахдаа итгэлтэй байна уу?`,
            confirmLabel: "Устгах",
            variant: "destructive"
        });
        if (!confirmed) return;
        setIsBulkDeleting(true);
        try {
            await QuestionService.bulkDeleteQuestions(Array.from(selectedIds));
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
            toast.success(`${selectedIds.size} асуулт амжилттай устгагдлаа`);
        } catch {
            toast.error("Бүлгүдийг устгахад алдаа гарлаа");
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const handleDeleteAll = async () => {
        const filterDesc = [
            gradeFilter !== "all" ? `${GRADES_MAP[gradeFilter]} анги` : "",
            subjectFilter !== "all" ? "сэдвээр шүүтгэсэн" : "",
            typeFilter !== "all" ? typeFilter : ""
        ].filter(Boolean).join(", ") || "бүх фильтэр";

        const confirmed = await confirm({
            title: "Бүх асуулт устгах",
            message: `Одоогийн фильтэр (${filterDesc})-т тохирсон БҮХ асуултыг устгахаа? Энэ үйлдэл буцаах боломжгүй!`,
            confirmLabel: "Бүгдийг устгах",
            variant: "destructive"
        });
        if (!confirmed) return;
        setIsBulkDeleting(true);
        try {
            const count = await QuestionService.deleteAllMatchingQuestions(typeFilter, subjectFilter, gradeFilter, authorFilter);
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
            toast.success(`${count} асуулт амжилттай устгагдлаа`);
        } catch {
            toast.error("Бүгдийг устгахад алдаа гарлаа");
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const handleApproveCorrection = async (correctionId: string) => {
        try {
            await updateDoc(doc(db, "corrections", correctionId), { status: "approved" });
            queryClient.invalidateQueries({ queryKey: ["admin_corrections"] });
            toast.success("Засвар зөвшөөрөгдлөө");
        } catch {
            toast.error("Алдаа гарлаа");
        }
    };

    const handleRejectCorrection = async (correctionId: string) => {
        const confirmed = await confirm({
            title: "Татгалзах",
            message: "Энэ засварын хүсэлтийг татгалзахдаа итгэлтэй байна уу?",
            confirmLabel: "Татгалзах",
            variant: "destructive"
        });
        if (!confirmed) return;
        try {
            await updateDoc(doc(db, "corrections", correctionId), { status: "rejected" });
            queryClient.invalidateQueries({ queryKey: ["admin_corrections"] });
            toast.success("Засвар татгалзагдлаа");
        } catch {
            toast.error("Алдаа гарлаа");
        }
    };

    const typeLabels: Record<QuestionType, string> = {
        multiple_choice: "Сонгох",
        fill_in_blank: "Нөхөх",
        input: "Хариулах"
    };

    const downloadTemplate = async () => {
        const headers = ["Анги", "Хичээл", "Сэдэв", "Төрөл", "Оноо", "Асуулт", "Сонголт А", "Сонголт Б", "Сонголт В", "Сонголт Г", "Зөв хариу", "Бодолт", "Зураг"];
        const csv = Papa.unparse([headers]);
        
        const zip = new JSZip();
        const folder = zip.folder("questions");
        folder?.file("questions.csv", "\ufeff" + csv);
        folder?.folder("images");
        
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = "question_template.zip";
        a.click();
    };

    const downloadInvalidArchive = async () => {
        if (invalidQuestions.length === 0) return;
        const csv = Papa.unparse(invalidQuestions);
        const zip = new JSZip();
        const folder = zip.folder("questions");
        folder?.file("questions.csv", "\ufeff" + csv);
        
        const imagesFolder = folder?.folder("images");
        invalidQuestions.forEach(row => {
             const imgName = row["Зураг"]?.trim();
             if (imgName) {
                 const blob = parsedImageFiles.get(imgName) || parsedImageFiles.get(`images/${imgName}`) || parsedImageFiles.get(`questions/images/${imgName}`);
                 if (blob) {
                     imagesFolder?.file(imgName, blob);
                 }
             }
        });
        
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = "invalid_questions_with_images.zip";
        a.click();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isZip = file.name.toLowerCase().endsWith(".zip");
        const imageFilesMap = new Map<string, Blob>();
        let csvText = "";

        if (isZip) {
            try {
                const zip = await JSZip.loadAsync(file);
                const csvFile = Object.values(zip.files).find(f => f.name.endsWith(".csv"));
                if (!csvFile) {
                    toast.error("ZIP дотор CSV файл олдсонгүй.");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    return;
                }
                csvText = await csvFile.async("text");

                for (const [path, zipEntry] of Object.entries(zip.files)) {
                    if (!zipEntry.dir && path.match(/\.(jpe?g|png|gif|webp)$/i)) {
                        const blob = await zipEntry.async("blob");
                        const filename = path.split('/').pop() || path;
                        imageFilesMap.set(filename, blob);
                        imageFilesMap.set(path, blob);
                    }
                }
            } catch (err: unknown) {
                toast.error("ZIP задлахад алдаа: " + (err instanceof Error ? err.message : String(err)));
                if (fileInputRef.current) fileInputRef.current.value = "";
                return;
            }
        } else {
            csvText = await file.text();
        }

        setParsedImageFiles(imageFilesMap);

        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const valid: PendingQuestion[] = [];
                const invalid: InvalidQuestionRow[] = [];

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                results.data.forEach((rawRow: any) => {
                    const rowId = Math.random().toString(36).substring(7);
                    const rowBase = { ...rawRow, _tempId: rowId };
                    
                    const validation = validateRow(rowBase, subjectsData, user?.uid || "admin", imageFilesMap, lessonsData);
                    if (validation.isValid && validation.validData) {
                        valid.push({ ...validation.validData, tempId: rowId });
                    } else {
                        rowBase["Алдааны шалтгаан"] = validation.error;
                        invalid.push(rowBase);
                    }
                });

                setPendingQuestions(prev => [...prev, ...valid]);
                setInvalidQuestions(prev => [...prev, ...invalid]);
                if (fileInputRef.current) fileInputRef.current.value = "";
                
                toast.success(`Файл уншлаа: ${valid.length} зөв, ${invalid.length} алдаатай.`);
            },
            error: (err: unknown) => {
                toast.error("CSV уншихад алдаа гарлаа: " + (err instanceof Error ? err.message : String(err)));
            }
        });
    };

    const handleBulkSave = async () => {
        if (pendingQuestions.length === 0 || !user) return;
        setIsSavingBulk(true);
        try {
            const toSave = await Promise.all(pendingQuestions.map(async (q) => {
                let imageUrlStr = "";
                if (q.imageFile) {
                    const fileExt = q.imageFile.type.split('/')[1] || "png";
                    const fileName = `questions/bulk/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const storageRef = ref(storage, fileName);
                    await uploadBytes(storageRef, q.imageFile);
                    imageUrlStr = await getDownloadURL(storageRef);
                }
                
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { tempId, imageFile, ...rest } = q;
                return {
                    ...rest,
                    ...(imageUrlStr ? { imageUrl: imageUrlStr } : {}),
                    createdBy: user.uid
                };
            }));
            await QuestionService.createQuestionsBatch(toSave);
            toast.success(`${toSave.length} асуулт амжилттай нэмэгдлээ!`);
            setPendingQuestions([]);
            setInvalidQuestions([]);
            queryClient.invalidateQueries({ queryKey: ["admin_questions"] });
        } catch {
            toast.error("Хадгалахад алдаа гарлаа.");
        } finally {
            setIsSavingBulk(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-linear-to-r from-slate-50 to-blue-50/50 px-6 py-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden mb-6">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                            Асуултын сан
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">Бүх шалгалтын асуултыг удирдах, зохион байгуулах</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={downloadTemplate} variant="outline" className="bg-white hover:bg-slate-50 border-slate-200">
                            <Download className="w-4 h-4 mr-2" /> Загвар татах (ZIP)
                        </Button>
                        <div>
                            <input
                                type="file"
                                accept=".csv,.zip"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                            />
                            <Button 
                                onClick={() => fileInputRef.current?.click()} 
                                variant="outline" 
                                className="bg-white hover:bg-slate-50 border-slate-200"
                            >
                                <Upload className="w-4 h-4 mr-2" /> Файл оруулах (CSV, ZIP)
                            </Button>
                        </div>
                        <Button onClick={() => router.push("/teacher/questions/create")} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-200">
                            <Plus className="w-4 h-4 mr-2" /> Асуулт нэмэх
                        </Button>
                    </div>
                </div>
                <div className="absolute right-0 top-0 w-64 h-64 bg-blue-100/50 rounded-full blur-3xl -mr-32 -mt-32"></div>
            </div>

            {/* Prefix Bulk Upload Preview */}
            {(pendingQuestions.length > 0 || invalidQuestions.length > 0) && (
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                    {pendingQuestions.length > 0 && (
                        <Card className="border-emerald-200 shadow-sm bg-emerald-50/50">
                            <CardHeader className="py-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-emerald-800 flex items-center gap-2">
                                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                                        Оруулахад бэлэн ({pendingQuestions.length})
                                    </h3>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => setPendingQuestions([])} className="h-8">Цуцлах</Button>
                                        <Button size="sm" onClick={handleBulkSave} disabled={isSavingBulk} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8">
                                            {isSavingBulk ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                                            Бүгдийг хадгалах
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="max-h-60 overflow-y-auto pt-0">
                                <div className="space-y-2">
                                    {pendingQuestions.slice(0, 10).map((q, i) => (
                                        <div key={q.tempId} className="flex items-center justify-between bg-white p-3 rounded-md border border-emerald-100 text-sm">
                                            <div className="truncate max-w-[60%]">
                                                <span className="font-semibold text-emerald-700 mr-2">#{i + 1}</span>
                                                {q.content.substring(0, 55)}...
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                                {getLessonNameForSubject(q.subject || "") && (
                                                    <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold border border-indigo-100">
                                                        {getLessonNameForSubject(q.subject || "")}
                                                    </span>
                                                )}
                                                {q.subject && subjectsMap[q.subject] && (
                                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium border border-slate-200">
                                                        {subjectsMap[q.subject]}
                                                    </span>
                                                )}
                                                {q.imageFile && (
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-medium border border-blue-200">
                                                        🖼️
                                                    </span>
                                                )}
                                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">{typeLabels[q.type]}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {pendingQuestions.length > 10 && (
                                        <div className="text-center text-xs text-slate-500 pt-2">...цаана нь {pendingQuestions.length - 10} асуулт бий</div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {invalidQuestions.length > 0 && (
                        <Card className="border-red-200 shadow-sm bg-red-50/50">
                            <CardHeader className="py-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-red-800 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-red-600" />
                                        Алдаатай / Хичээл·Сэдэв олдсонгүй ({invalidQuestions.length})
                                    </h3>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => setInvalidQuestions([])} className="h-8">Устгах</Button>
                                        <Button size="sm" onClick={downloadInvalidArchive} variant="destructive" className="h-8">
                                            <Download className="w-4 h-4 mr-2" />
                                            Алдаатайг татах (ZIP)
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="max-h-60 overflow-y-auto pt-0">
                                <div className="space-y-2">
                                    {invalidQuestions.slice(0, 10).map((row, i) => (
                                        <div key={i} className="bg-white p-3 rounded-md border border-red-100 text-sm mb-2">
                                            {editingTempId === row._tempId ? (
                                                <div className="space-y-3">
                                                    <Input value={editRowData?.["Асуулт"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Асуулт": e.target.value} : null)} placeholder="Асуулт" />
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Select value={editRowData?.["Анги"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Анги": e.target.value} : null)}>
                                                            <option value="">Анги сонгох...</option>
                                                            {Object.entries(GRADES_MAP).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                                                        </Select>
                                                        <Select
                                                            value={editLessonId}
                                                            onChange={e => {
                                                                setEditLessonId(e.target.value);
                                                                setEditRowData(prev => prev ? { ...prev, "Хичээл": lessonsData.find(l => l.id === e.target.value)?.name || "", "Сэдэв": "" } : null);
                                                            }}
                                                        >
                                                            <option value="">Хичээл сонгох...</option>
                                                            {lessonsData.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                                        </Select>
                                                        <Select value={editRowData?.["Сэдэв"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Сэдэв": e.target.value} : null)}>
                                                            <option value="">Сэдэв сонгох...</option>
                                                            {editSubjectsFiltered.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                        </Select>
                                                        <Input value={editRowData?.["Төрөл"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Төрөл": e.target.value} : null)} placeholder="Төрөл (Сонгох, Нөхөх...)" />
                                                        <Input value={editRowData?.["Оноо"] || ""} type="number" onChange={e => setEditRowData(prev => prev ? {...prev, "Оноо": e.target.value} : null)} placeholder="Оноо" />
                                                        <Input value={editRowData?.["Сонголт А"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Сонголт А": e.target.value} : null)} placeholder="Сонголт А" />
                                                        <Input value={editRowData?.["Сонголт Б"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Сонголт Б": e.target.value} : null)} placeholder="Сонголт Б" />
                                                        <Input value={editRowData?.["Сонголт В"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Сонголт В": e.target.value} : null)} placeholder="Сонголт В" />
                                                        <Input value={editRowData?.["Сонголт Г"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Сонголт Г": e.target.value} : null)} placeholder="Сонголт Г" />
                                                        <Input value={editRowData?.["Зөв хариу"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Зөв хариу": e.target.value} : null)} placeholder="Зөв хариу" />
                                                        <Input value={editRowData?.["Бодолт"] || ""} onChange={e => setEditRowData(prev => prev ? {...prev, "Бодолт": e.target.value} : null)} placeholder="Бодолт" />
                                                    </div>
                                                    {editRowData?.["Алдааны шалтгаан"] && (
                                                        <div className="text-xs text-red-500 font-medium bg-red-50 p-2 rounded border border-red-100">Шалтгаан: {editRowData["Алдааны шалтгаан"]}</div>
                                                    )}
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 text-xs">Цуцлах</Button>
                                                        <Button size="sm" onClick={handleSaveInvalidEdit} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">Хадгалах & Дахин шалгах</Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="font-medium text-red-700 truncate flex-1">{row["Асуулт"]?.substring(0, 50) || "Хоосон асуулт"}</div>
                                                        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => { setEditingTempId(row._tempId); setEditRowData(row); }}>
                                                            Засах
                                                        </Button>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                        {row["Хичээл"] && (
                                                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold border border-indigo-100">
                                                                {row["Хичээл"]}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-slate-500">
                                                            Сэдэв: <span className="font-medium">{`"${row["Сэдэв"] || "Хоосон"}"`}</span>
                                                        </span>
                                                    </div>
                                                    {row["Алдааны шалтгаан"] && (
                                                        <div className="text-xs text-red-500 font-medium mt-1">Шалтгаан: {row["Алдааны шалтгаан"]}</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    {invalidQuestions.length > 10 && (
                                        <div className="text-center text-xs text-slate-500 pt-2">...цаана нь {invalidQuestions.length - 10} асуулт бий</div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Tab switcher */}
            <div className="flex gap-2 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab("questions")}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
                        activeTab === "questions"
                            ? "bg-white border border-b-white border-gray-200 text-blue-700 -mb-px"
                            : "text-gray-500 hover:text-gray-700"
                    }`}
                >
                    Асуултууд
                </button>
                <button
                    onClick={() => setActiveTab("corrections")}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-colors flex items-center gap-2 ${
                        activeTab === "corrections"
                            ? "bg-white border border-b-white border-gray-200 text-amber-700 -mb-px"
                            : "text-gray-500 hover:text-gray-700"
                    }`}
                >
                    <AlertTriangle className="w-4 h-4" />
                    Засварын хүсэлтүүд
                    {corrections.length > 0 && (
                        <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {corrections.length}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === "questions" ? (
                <Card className="bg-white shadow-xl border-0">
                    <CardHeader>
                        <div className="flex flex-row items-center gap-2 w-full overflow-x-auto pb-2 sm:pb-0">
                            <div className="flex-1 min-w-[200px]">
                                <Input
                                    placeholder="Асуулт хайх..."
                                    className="h-9 text-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <Select
                                value={gradeFilter}
                                onChange={(e) => {
                                    setGradeFilter(e.target.value);
                                    setSubjectFilter("all");
                                }}
                                className="w-32 h-9 text-sm"
                            >
                                <option value="all">Бүх анги</option>
                                {Object.entries(GRADES_MAP).map(([id, name]) => (
                                    <option key={id} value={id}>{name}</option>
                                ))}
                            </Select>
                            <Select
                                value={subjectFilter}
                                onChange={(e) => setSubjectFilter(e.target.value)}
                                className="w-40 h-9 text-sm"
                            >
                                <option value="all">Бүх сэдэв</option>
                                {filteredSubjects.map((s: Subject) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </Select>
                            <Select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value as QuestionType | "all")}
                                className="w-32 h-9 text-sm"
                            >
                                <option value="all">Бүх төрөл</option>
                                <option value="multiple_choice">Сонгох</option>
                                <option value="input">Хариулах</option>
                            </Select>
                            <Select
                                value={authorFilter}
                                onChange={(e) => setAuthorFilter(e.target.value)}
                                className="h-9 text-sm min-w-[130px]"
                            >
                                <option value="all">Бүх багш нар</option>
                                {authors.map(a => (
                                    <option key={a.uid} value={a.uid}>{a.lastName} {a.firstName}</option>
                                ))}
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {/* Bulk actions toolbar */}
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-3 px-2 py-2 mb-3 bg-red-50 border border-red-100 rounded-lg">
                                <span className="text-sm font-semibold text-red-700">{selectedIds.size} асуулт сонгогдсон</span>
                                <Button
                                    onClick={handleBulkDelete}
                                    disabled={isBulkDeleting}
                                    className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1"
                                >
                                    {isBulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    Сонгосоныг устгах
                                </Button>
                                <Button
                                    onClick={() => setSelectedIds(new Set())}
                                    variant="outline"
                                    className="h-7 px-3 text-xs"
                                >
                                    Цуцлах
                                </Button>
                                <div className="ml-auto">
                                    <Button
                                        onClick={handleDeleteAll}
                                        disabled={isBulkDeleting}
                                        className="h-7 px-3 text-xs bg-red-800 hover:bg-red-900 text-white font-bold flex items-center gap-1"
                                    >
                                        <Trash2 className="w-3 h-3" /> Фильтэрт тохирсон бүгдийг устгах
                                    </Button>
                                </div>
                            </div>
                        )}
                        <div className="rounded-md border border-gray-100 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-900 font-semibold border-b border-gray-200">
                                    <tr>
                                        <th className="px-3 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={isAllSelected}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                                            />
                                        </th>
                                        <th className="px-4 py-3">Агуулга</th>
                                        <th className="px-4 py-3 w-32">Төрөл</th>
                                        <th className="px-4 py-3 w-32">Сэдэв</th>
                                        <th className="px-4 py-3 w-24">Анги</th>
                                        <th className="px-4 py-3 w-32 text-left">Багш</th>
                                        <th className="px-4 py-3 w-32 text-left">Огноо</th>
                                        <th className="px-4 py-3 w-20 text-center">Оноо</th>
                                        <th className="px-4 py-3 w-24 text-right">Үйлдэл</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                                    Асуултуудыг ачаалж байна...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : isError ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-8 text-center text-red-500">
                                                <p className="font-bold">Алдаа гарлаа</p>
                                                <p className="text-sm opacity-80">{(error as Error)?.message || "Өгөгдлийг татахад алдаа гарлаа"}</p>
                                                <button
                                                    onClick={() => queryClient.invalidateQueries({ queryKey: ["admin_questions"] })}
                                                    className="mt-4 text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-all"
                                                >
                                                    Дахин оролдох
                                                </button>
                                            </td>
                                        </tr>
                                    ) : displayQuestions.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-8 text-center text-gray-500 italic">Асуулт олдсонгүй.</td>
                                        </tr>
                                    ) : (
                                        displayQuestions.map((q) => (
                                            <tr key={q.id} className={`hover:bg-gray-50/50 transition-colors ${selectedIds.has(q.id) ? 'bg-blue-50/50' : ''}`}>
                                                <td className="px-3 py-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(q.id)}
                                                        onChange={() => toggleSelect(q.id)}
                                                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 font-medium text-gray-900">
                                                    <div className="line-clamp-2 max-h-12 overflow-hidden" title={q.content}>
                                                        <MathRenderer content={q.content} />
                                                    </div>
                                                    {q.mediaUrl && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 mt-1">
                                                            Медиа: {q.mediaType}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-gray-500">{typeLabels[q.type] || q.type}</td>
                                                <td className="px-4 py-3 text-gray-500 truncate max-w-[120px]">{(q.subject && subjectsMap[q.subject]) || q.subject || "-"}</td>
                                                <td className="px-4 py-3 text-gray-500">{(q.grade && GRADES_MAP[q.grade]) || q.grade || "-"}</td>
                                                <td className="px-4 py-3 text-gray-500 italic text-xs">
                                                    {q.createdBy ? (
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                                                            {authors.find(a => a.uid === q.createdBy)?.lastName.charAt(0)}.{authors.find(a => a.uid === q.createdBy)?.firstName || "N/A"}
                                                        </span>
                                                    ) : "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                                                    {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "-"}
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-500">{q.points || 1}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-3 font-medium text-xs">
                                                        <Link href={`/teacher/questions/edit/${q.id}`} className="text-blue-600 hover:text-blue-900">
                                                            Засах
                                                        </Link>
                                                        <button
                                                            onClick={() => handleDelete(q.id)}
                                                            className="text-red-600 hover:text-red-900 transition-colors"
                                                        >
                                                            Устгах
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {(!loading || isFetching) && questions.length > 0 && (
                            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100 pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                        Нийт {totalCount} асуултаас {currentPage * PAGE_SIZE + 1} - {Math.min((currentPage * PAGE_SIZE) + displayQuestions.length, totalCount)} хүртэл харуулж байна
                                    </div>
                                    {isFetching && (
                                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handlePrev}
                                        disabled={currentPage === 0 || isFetching}
                                        className="flex items-center gap-1 px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        Өмнөх
                                    </button>
                                    <div className="flex items-center gap-1 px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold text-blue-600">
                                        {currentPage + 1}
                                    </div>
                                    <button
                                        onClick={handleNext}
                                        disabled={!hasNext || isFetching}
                                        className="flex items-center gap-1 px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase"
                                    >
                                        Дараагийн
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                /* Corrections tab */
                <Card className="bg-white shadow-xl border-0">
                    <CardContent className="p-6">
                        {correctionsLoading ? (
                            <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
                                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                Засварын хүсэлтүүдийг ачаалж байна...
                            </div>
                        ) : corrections.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                                <p className="font-medium">Хүлээгдэж буй засварын хүсэлт байхгүй байна.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {corrections.map((c) => (
                                    <div
                                        key={c.id}
                                        className="border border-amber-100 bg-amber-50/40 rounded-xl p-5 space-y-3"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-amber-700 font-semibold mb-1 uppercase tracking-wide">
                                                    Асуултын агуулга
                                                </p>
                                                <p className="text-sm text-gray-800 font-medium line-clamp-3">
                                                    {c.questionContent}
                                                </p>
                                            </div>
                                            <Link
                                                href={`/teacher/questions/edit/${c.questionId}`}
                                                className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
                                            >
                                                Засах →
                                            </Link>
                                        </div>

                                        <div className="bg-white border border-amber-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-500 font-medium mb-1">Багшийн санал:</p>
                                            <p className="text-sm text-gray-700">{c.note}</p>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="text-xs text-gray-400">
                                                <span className="font-medium text-gray-600">{c.submittedByName}</span>
                                                {" · "}
                                                {c.createdAt?.toDate
                                                    ? c.createdAt.toDate().toLocaleDateString("mn-MN")
                                                    : ""}
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleRejectCorrection(c.id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                                >
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    Татгалзах
                                                </button>
                                                <button
                                                    onClick={() => handleApproveCorrection(c.id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                                >
                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                    Зөвшөөрөх
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
