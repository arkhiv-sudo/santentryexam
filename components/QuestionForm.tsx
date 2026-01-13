"use client";

import { useState, useEffect } from "react";
import { Question, QuestionType } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Trash2, Plus, ArrowLeft, Save, Eye, ImageIcon, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { SettingsService } from "@/lib/services/settings-service";
import { UploadService } from "@/lib/services/upload-service";
import { Grade, Subject } from "@/types";
import { QuestionPreviewModal } from "./exam/QuestionPreviewModal";
import QuestionPreview from "./exam/QuestionPreview";

interface QuestionFormProps {
    initialData?: Question;
    onSubmit: (data: Omit<Question, "id">) => Promise<void>;
    loading?: boolean;
    showHeader?: boolean;
    showBackButton?: boolean;
}

const GRADES = Array.from({ length: 12 }, (_, i) => ({ id: `${i + 1}`, name: `${i + 1}-р анги` }));

export function QuestionForm({
    initialData,
    onSubmit,
    loading: submitting,
    showHeader = true,
    showBackButton = true
}: QuestionFormProps) {
    const router = useRouter();
    const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
    const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [uploadingSolutionMedia, setUploadingSolutionMedia] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    const [formData, setFormData] = useState<Omit<Question, "id">>({
        type: "multiple_choice",
        content: "",
        options: [""],
        correctAnswer: "",
        points: 1,
        category: "",
        subject: "",
        grade: "",
        solution: "",
        solutionMediaUrl: "",
        solutionMediaType: undefined,
        mediaType: undefined,
        mediaUrl: "",
        optionImages: [],
        createdBy: ""
    });

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const sData = await SettingsService.getSubjects();
                setAllSubjects(sData);
            } catch (error) {
                console.error("Failed to load settings:", error);
            }
        };
        loadSettings();
    }, []);

    useEffect(() => {
        if (initialData) {
            setFormData({
                type: initialData.type,
                content: initialData.content,
                options: initialData.options || [""],
                correctAnswer: initialData.correctAnswer,
                points: initialData.points || 1,
                category: initialData.category || "",
                subject: initialData.subject || "",
                grade: initialData.grade || "",
                solution: initialData.solution || "",
                solutionMediaUrl: initialData.solutionMediaUrl || "",
                solutionMediaType: initialData.solutionMediaType,
                mediaType: initialData.mediaType,
                mediaUrl: initialData.mediaUrl || "",
                optionImages: initialData.optionImages || [],
                createdBy: initialData.createdBy || ""
            });
        }
    }, [initialData]);

    // Filter subjects when grade changes
    useEffect(() => {
        if (formData.grade) {
            const filtered = allSubjects.filter(s => !s.gradeId || s.gradeId === formData.grade);
            setFilteredSubjects(filtered);
        } else {
            setFilteredSubjects(allSubjects);
        }
    }, [formData.grade, allSubjects]);

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...(formData.options || [])];
        newOptions[index] = value;
        setFormData({ ...formData, options: newOptions });
    };

    const addOption = () => {
        setFormData({
            ...formData,
            options: [...(formData.options || []), ""],
            optionImages: [...(formData.optionImages || []), ""]
        });
    };

    const removeOption = (index: number) => {
        const newOptions = (formData.options || []).filter((_, i) => i !== index);
        const newOptionImages = (formData.optionImages || []).filter((_, i) => i !== index);
        setFormData({ ...formData, options: newOptions, optionImages: newOptionImages });
    };

    const handleOptionImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const url = await UploadService.uploadImageDeduplicated(file);
            const newOptionImages = [...(formData.optionImages || [])];
            // Ensure array is long enough
            while (newOptionImages.length <= index) {
                newOptionImages.push("");
            }
            newOptionImages[index] = url;
            setFormData({ ...formData, optionImages: newOptionImages });
        } catch (error) {
            console.error("Option image upload failed:", error);
        }
    };

    const removeOptionImage = (index: number) => {
        const newOptionImages = [...(formData.optionImages || [])];
        newOptionImages[index] = "";
        setFormData({ ...formData, optionImages: newOptionImages });
    };

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, isSolution: boolean = false) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (isSolution) setUploadingSolutionMedia(true);
        else setUploadingMedia(true);

        try {
            const url = await UploadService.uploadImageDeduplicated(file);
            if (isSolution) {
                setFormData({ ...formData, solutionMediaUrl: url, solutionMediaType: 'image' });
            } else {
                setFormData({ ...formData, mediaUrl: url, mediaType: 'image' });
            }
        } catch (error) {
            console.error("Upload failed:", error);
        } finally {
            if (isSolution) setUploadingSolutionMedia(false);
            else setUploadingMedia(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(formData as any);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            {showHeader && (
                <div className="flex items-center gap-4 mb-6">
                    {showBackButton && (
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-600" />
                        </button>
                    )}
                    <h1 className="text-2xl font-bold text-slate-900 flex-1">
                        {initialData ? "Асуулт засах" : "Шинэ асуулт үүсгэх"}
                    </h1>
                </div>
            )}

            <div className="grid gap-8 lg:grid-cols-2 items-start">
                {/* Left Side: Inputs */}
                <div className="space-y-6">
                    <Card>
                        <CardContent className="pt-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Асуултын агуулга</label>
                                <textarea
                                    className="w-full min-h-[150px] p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-y"
                                    placeholder="Асуултаа энд бичнэ үү... (LaTeX болон Код бичиж болно)"
                                    value={formData.content}
                                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                    required
                                />
                                <p className="text-[10px] text-slate-400 mt-1 font-medium italic">
                                    Математик: $x^2$, Код: ``` code ``` ашиглана уу.
                                </p>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Асуултын төрөл</label>
                                    <Select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as QuestionType })}
                                    >
                                        <option value="multiple_choice">Сонгох (Олон хувилбарт)</option>
                                        <option value="input">Хариу оруулах (Богино хариулт)</option>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Оноо</label>
                                    <Input
                                        type="number"
                                        min="0.5"
                                        step="0.5"
                                        value={formData.points}
                                        onChange={(e) => setFormData({ ...formData, points: parseFloat(e.target.value) })}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {formData.type === "multiple_choice" && (
                        <Card className="border-blue-100 bg-blue-50/30">
                            <CardContent className="pt-6 space-y-4">
                                <label className="block text-sm font-bold text-blue-900 mb-2 flex justify-between items-center">
                                    Сонголтууд
                                    {formData.options && formData.options.length < 5 && (
                                        <button
                                            type="button"
                                            onClick={addOption}
                                            className="text-xs flex items-center gap-1 bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all font-bold shadow-sm"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Сонголт нэмэх
                                        </button>
                                    )}
                                </label>
                                <div className="space-y-3">
                                    {formData.options?.map((option, index) => (
                                        <div key={index} className="flex gap-3 group">
                                            <div className="flex-1 space-y-2">
                                                <div className="relative">
                                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-100 rounded text-[10px] font-bold flex items-center justify-center text-slate-500">
                                                        {String.fromCharCode(65 + index)}
                                                    </div>
                                                    <input
                                                        className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                                                        value={option}
                                                        onChange={(e) => handleOptionChange(index, e.target.value)}
                                                        placeholder={`Сонголт ${index + 1}`}
                                                        required
                                                    />
                                                </div>

                                                {/* Option Image Upload */}
                                                <div className="flex items-center gap-3 pl-2">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => handleOptionImageUpload(index, e)}
                                                        className="hidden"
                                                        id={`option-image-${index}`}
                                                    />
                                                    <label
                                                        htmlFor={`option-image-${index}`}
                                                        className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 cursor-pointer transition-colors bg-white px-2 py-1 rounded-md border border-slate-100 shadow-sm"
                                                    >
                                                        <ImageIcon className="w-3 h-3" />
                                                        Зураг нэмэх
                                                    </label>
                                                    {formData.optionImages?.[index] && (
                                                        <div className="flex items-center gap-2 group/img relative">
                                                            <img src={formData.optionImages[index]} className="w-8 h-8 object-cover rounded border border-slate-200" alt="Option" />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeOptionImage(index)}
                                                                className="p-1 bg-red-50 text-red-500 rounded-md hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    name="correctAnswer"
                                                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                                                    checked={formData.correctAnswer === option && option !== ""}
                                                    onChange={() => setFormData({ ...formData, correctAnswer: option })}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeOption(index)}
                                                    className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-xl transition-all border border-transparent hover:border-red-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] text-blue-600/70 font-medium">Зөв хариултыг дугуй дээр дарж сонгоно уу.</p>
                            </CardContent>
                        </Card>
                    )}

                    {(formData.type !== "multiple_choice") && (
                        <Card className="border-emerald-100 bg-emerald-50/30">
                            <CardContent className="pt-6">
                                <label className="block text-sm font-bold text-emerald-900 mb-2">
                                    Зөв хариулт
                                </label>
                                <Input
                                    value={formData.correctAnswer}
                                    onChange={(e) => setFormData({ ...formData, correctAnswer: e.target.value })}
                                    placeholder="Зөв хариултыг энд бичнэ үү..."
                                    required
                                    className="bg-white border-emerald-100"
                                />
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border border-slate-200">
                        <CardContent className="pt-6 space-y-4">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Бодолт (Тайлбар)</label>
                            <textarea
                                className="w-full min-h-[120px] p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-y"
                                placeholder="Зөв хариултын тайлбар, бодолтыг энд бичнэ үү..."
                                value={formData.solution}
                                onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
                            />

                            <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Бодолтын зураг (Заавал биш)</label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleMediaUpload(e, true)}
                                        className="hidden"
                                        id="solution-media-upload"
                                    />
                                    <label
                                        htmlFor="solution-media-upload"
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer text-sm font-medium transition-colors shadow-sm"
                                    >
                                        {uploadingSolutionMedia ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <ImageIcon className="w-4 h-4 text-slate-500" />
                                        )}
                                        Зураг сонгох
                                    </label>
                                    {formData.solutionMediaUrl && (
                                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                                            <img src={formData.solutionMediaUrl} className="w-8 h-8 object-cover rounded" alt="Preview" />
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, solutionMediaUrl: "", solutionMediaType: undefined })}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <h3 className="font-bold text-slate-900">Бусад мэдээлэл</h3>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Анги</label>
                                    <Select
                                        value={formData.grade}
                                        onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                        required
                                    >
                                        <option value="">Сонгох...</option>
                                        {GRADES.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </Select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Сэдэв / Хичээл</label>
                                    <Select
                                        value={formData.subject}
                                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                        required
                                    >
                                        <option value="">Сонгох...</option>
                                        {filteredSubjects.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Асуултын зураг (Заавал биш)</label>
                                <div className="space-y-3">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleMediaUpload(e)}
                                        className="hidden"
                                        id="media-upload"
                                    />
                                    <label
                                        htmlFor="media-upload"
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 cursor-pointer text-sm font-medium transition-all group"
                                    >
                                        {uploadingMedia ? (
                                            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                        ) : (
                                            <ImageIcon className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                                        )}
                                        <span className="text-slate-600 group-hover:text-blue-600">
                                            {uploadingMedia ? "Уншиж байна..." : "Зураг оруулах"}
                                        </span>
                                    </label>
                                    {formData.mediaUrl && (
                                        <div className="relative rounded-xl overflow-hidden border border-slate-200">
                                            <img src={formData.mediaUrl} className="w-full h-auto max-h-48 object-contain bg-white" alt="Preview" />
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, mediaUrl: "", mediaType: undefined })}
                                                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-lg"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 rounded-2xl flex items-center justify-center gap-2 text-lg shadow-lg shadow-blue-200"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <Save className="w-5 h-5" />
                        )}
                        {initialData ? "Өөрчлөлтийг хадгалах" : "Асуулт хадгалах"}
                    </Button>
                </div>

                {/* Right Side: Sticky Preview */}
                <div className="lg:sticky lg:top-24 h-[calc(100vh-140px)] min-h-[500px]">
                    <QuestionPreview question={formData} />
                </div>
            </div>

            <QuestionPreviewModal
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                question={formData}
            />
        </form>
    );
}
