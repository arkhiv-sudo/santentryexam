"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { AnnouncementService, Announcement } from "@/lib/services/announcement-service";
import { UploadService } from "@/lib/services/upload-service";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2, Edit, Image as ImageIcon, X, Loader2 } from "lucide-react";
import Image from "next/image";

export default function AdminAnnouncementsPage() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!authLoading && profile?.role !== "admin") {
            router.push("/");
            return;
        }
        if (profile?.role === "admin") {
            loadAnnouncements();
        }
    }, [profile, authLoading, router]);

    const loadAnnouncements = async () => {
        try {
            const data = await AnnouncementService.getAll();
            setAnnouncements(data);
        } catch (error) {
            console.error("Failed to load announcements:", error);
            toast.error("Мэдэгдэл уншихад алдаа гарлаа");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setTitle("");
        setContent("");
        setImageFile(null);
        setImagePreview(null);
        setEditingId(null);
        setIsFormOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleOpenCreate = () => {
        resetForm();
        setIsFormOpen(true);
    };

    const handleEdit = (ann: Announcement) => {
        setTitle(ann.title);
        setContent(ann.content);
        setImageFile(null);
        setImagePreview(ann.imageUrl || null);
        setEditingId(ann.id);
        setIsFormOpen(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) {
            toast.error("Гарчиг болон агуулгаа оруулна уу!");
            return;
        }

        setIsUploading(true);
        try {
            let finalImageUrl = imagePreview && !imageFile ? imagePreview : undefined;

            if (imageFile) {
                finalImageUrl = await UploadService.uploadImageDeduplicated(imageFile, "announcements");
            } else if (!imagePreview) {
                 finalImageUrl = undefined; // Specifically clear image if removed during edit
            }

            if (editingId) {
                await AnnouncementService.update(editingId, {
                    title: title.trim(),
                    content: content.trim(),
                    imageUrl: finalImageUrl,
                });
                toast.success("Мэдэгдэл шинэчлэгдлээ!");
            } else {
                await AnnouncementService.create({
                    title: title.trim(),
                    content: content.trim(),
                    imageUrl: finalImageUrl,
                    createdBy: profile?.uid || "admin",
                });
                toast.success("Мэдэгдэл нийтлэгдлээ!");
            }
            
            await loadAnnouncements();
            resetForm();
        } catch (error) {
            console.error("Error saving announcement:", error);
            toast.error("Хадгалахад алдаа гарлаа");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Та энэ мэдэгдлийг устгахдаа итгэлтэй байна уу?")) return;
        
        try {
            await AnnouncementService.delete(id);
            toast.success("Мэдэгдэл устгагдлаа!");
            loadAnnouncements();
        } catch (error) {
            console.error("Error deleting announcement:", error);
            toast.error("Устгахад алдаа гарлаа");
        }
    };

    if (authLoading || loading) {
        return <div className="p-8 text-center text-slate-500">Уншиж байна...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Megaphone className="w-6 h-6 text-blue-600" />
                        Мэдэгдлийн удирдлага
                    </h1>
                    <p className="text-sm text-slate-500">Эцэг эхчүүдэд зориулсан нийтлэг мэдэгдэл, мэдээлэл оруулах</p>
                </div>
                {!isFormOpen && (
                    <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                        <Plus className="w-4 h-4" /> Шинэ мэдэгдэл
                    </Button>
                )}
            </div>

            {isFormOpen && (
                <Card className="border-blue-100 shadow-md">
                    <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
                        <CardTitle className="text-lg flex items-center justify-between">
                            {editingId ? "Мэдэгдэл засах" : "Шинэ мэдэгдэл үүсгэх"}
                            <Button variant="ghost" size="sm" onClick={resetForm} className="h-8 w-8 p-0 rounded-full">
                                <X className="w-4 h-4 text-slate-500" />
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Гарчиг</label>
                                <Input
                                    placeholder="Мэдэгдлийн гарчиг..."
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={isUploading}
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Агуулга</label>
                                <textarea
                                    className="w-full min-h-[120px] p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-sm resize-y"
                                    placeholder="Мэдэгдлийн дэлгэрэнгүй агуулга..."
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    disabled={isUploading}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Зураг (Заавал биш)</label>
                                
                                {imagePreview ? (
                                    <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-slate-200 group">
                                        <div className="aspect-video relative bg-slate-100">
                                            <Image 
                                                src={imagePreview} 
                                                alt="Preview" 
                                                fill 
                                                className="object-contain"
                                            />
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Button 
                                                type="button" 
                                                variant="destructive" 
                                                size="sm" 
                                                onClick={handleRemoveImage}
                                                disabled={isUploading}
                                                className="gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" /> Зураг устгах
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div 
                                        className={`w-full max-w-sm aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                                            isUploading ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-blue-400'
                                        }`}
                                        onClick={() => !isUploading && fileInputRef.current?.click()}
                                    >
                                        <div className="p-3 bg-white rounded-full shadow-sm">
                                            <ImageIcon className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-slate-600">Зураг оруулах</p>
                                            <p className="text-xs text-slate-400">PNG, JPG форматыг дэмжинэ</p>
                                        </div>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageChange}
                                    accept="image/*"
                                    className="hidden"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <Button type="button" variant="outline" onClick={resetForm} disabled={isUploading}>
                                    Цуцлах
                                </Button>
                                <Button type="submit" disabled={isUploading} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]">
                                    {isUploading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        editingId ? "Шинэчлэх" : "Нийтлэх"
                                    )}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4">
                {announcements.length === 0 && !isFormOpen && (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
                        <Megaphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">Мэдэгдэл одоогоор байхгүй байна</p>
                        <p className="text-sm text-slate-400 mt-1">Шинэ мэдэгдэл товчийг дарж үүсгэнэ үү</p>
                    </div>
                )}

                {announcements.map((ann) => (
                    <Card key={ann.id} className="overflow-hidden transition-shadow hover:shadow-md">
                        <div className="flex flex-col md:flex-row">
                            {ann.imageUrl && (
                                <div className="w-full md:w-48 h-48 md:h-auto shrink-0 relative bg-slate-100 border-b md:border-b-0 md:border-r border-slate-100">
                                    <Image 
                                        src={ann.imageUrl} 
                                        alt={ann.title} 
                                        fill 
                                        className="object-cover"
                                    />
                                </div>
                            )}
                            <div className="p-5 md:p-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-start gap-4 mb-2">
                                    <h3 className="text-lg font-bold text-slate-900 leading-tight">
                                        {ann.title}
                                    </h3>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEdit(ann)}
                                            className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(ann.id)}
                                            className="h-8 w-8 p-0 text-slate-500 hover:text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                                
                                <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-3 mb-4 flex-1">
                                    {ann.content}
                                </p>
                                
                                <div className="mt-auto">
                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                        {ann.createdAt.toLocaleString("mn-MN")}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
