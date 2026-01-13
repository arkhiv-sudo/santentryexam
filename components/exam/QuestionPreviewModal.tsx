"use client";

import { Question } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import MathRenderer from "./MathRenderer";

interface QuestionPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    question: Partial<Question>;
}

export function QuestionPreviewModal({ isOpen, onClose, question }: QuestionPreviewModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-opacity">
            <div
                className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
                        Асуултыг урьдчилан харах
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Question Content */}
                    <div className="space-y-4">
                        <div className="text-lg font-medium text-slate-900 leading-relaxed">
                            <MathRenderer content={question.content || "Асуултын агуулга хоосон байна..."} />
                        </div>

                        {question.mediaUrl && (
                            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                                <img
                                    src={question.mediaUrl}
                                    className="w-full h-auto max-h-[300px] object-contain"
                                    alt="Question media"
                                />
                            </div>
                        )}
                    </div>

                    {/* Options */}
                    {question.type === "multiple_choice" && question.options && (
                        <div className="grid gap-3">
                            {question.options.map((opt, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${question.correctAnswer === opt && opt !== ""
                                            ? "border-emerald-200 bg-emerald-50/50 ring-1 ring-emerald-500"
                                            : "border-slate-200 bg-white"
                                        }`}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${question.correctAnswer === opt && opt !== ""
                                            ? "bg-emerald-500 text-white"
                                            : "bg-slate-100 text-slate-500"
                                        }`}>
                                        {String.fromCharCode(65 + idx)}
                                    </div>
                                    <div className="flex-1 font-medium text-slate-700">
                                        <MathRenderer content={opt} />
                                    </div>
                                    {question.correctAnswer === opt && opt !== "" && (
                                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                            Зөв хариулт
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Numeric/Text Answer */}
                    {question.type !== "multiple_choice" && question.correctAnswer && (
                        <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/30">
                            <label className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Зөв хариулт:</label>
                            <div className="font-bold text-emerald-900 text-lg">
                                <MathRenderer content={question.correctAnswer} />
                            </div>
                        </div>
                    )}

                    {/* Solution */}
                    {question.solution && (
                        <div className="mt-8 space-y-3 pt-6 border-t border-slate-100">
                            <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">Бодолт / Тайлбар:</label>
                            <div className="text-slate-600 leading-relaxed bg-blue-50/30 p-4 rounded-xl border border-blue-50">
                                <MathRenderer content={question.solution} />
                            </div>
                            {question.solutionMediaUrl && (
                                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 mt-2">
                                    <img
                                        src={question.solutionMediaUrl}
                                        className="w-full h-auto max-h-[300px] object-contain"
                                        alt="Solution media"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <Button onClick={onClose} className="px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-xl">
                        Хаах
                    </Button>
                </div>
            </div>

            {/* Backdrop click to close */}
            <div className="fixed inset-0 -z-10" onClick={onClose}></div>
        </div>
    );
}
