"use client";

import { Question } from "@/types";
import MathRenderer from "./MathRenderer";

interface QuestionPreviewProps {
    question: Partial<Question>;
    className?: string;
}

export default function QuestionPreview({ question, className = "" }: QuestionPreviewProps) {
    return (
        <div className={`flex flex-col h-full bg-slate-50/80 rounded-2xl border border-slate-200 overflow-hidden shadow-sm ${className}`}>
            <div className="px-6 py-4 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
                    Шууд харах
                </h3>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded leading-none">PREVIEW</span>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
                {/* Question Content */}
                <div className="space-y-4">
                    <div className="text-lg font-medium text-slate-900 leading-relaxed bg-white p-4 rounded-xl border border-slate-100 shadow-sm min-h-[100px]">
                        <MathRenderer content={question.content || "Асуултын агуулга энд харагдана..."} />
                    </div>

                    {question.mediaUrl && (
                        <div className="rounded-xl overflow-hidden border border-slate-200 bg-white p-2 shadow-sm">
                            <img
                                src={question.mediaUrl}
                                className="w-full h-auto max-h-[250px] object-contain rounded-lg"
                                alt="Question media"
                            />
                        </div>
                    )}
                </div>

                {/* Options */}
                {question.type === "multiple_choice" && question.options && (
                    <div className="grid gap-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Сонголтууд:</label>
                        {question.options.map((opt, idx) => (
                            <div
                                key={idx}
                                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${question.correctAnswer === opt && opt !== ""
                                    ? "border-emerald-200 bg-emerald-50 ring-1 ring-emerald-500 shadow-sm"
                                    : "border-slate-200 bg-white shadow-sm"
                                    }`}
                            >
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${question.correctAnswer === opt && opt !== ""
                                    ? "bg-emerald-500 text-white"
                                    : "bg-slate-100 text-slate-500"
                                    }`}>
                                    {String.fromCharCode(65 + idx)}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div className="text-sm font-medium text-slate-700">
                                        <MathRenderer content={opt || "Сонголт..."} />
                                    </div>
                                    {question.optionImages?.[idx] && (
                                        <div className="rounded-lg overflow-hidden border border-slate-100 bg-white p-1 max-w-[200px]">
                                            <img
                                                src={question.optionImages[idx]}
                                                className="w-full h-auto object-contain rounded"
                                                alt={`Option ${String.fromCharCode(65 + idx)}`}
                                            />
                                        </div>
                                    )}
                                </div>
                                {question.correctAnswer === opt && opt !== "" && (
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Numeric/Text Answer */}
                {question.type !== "multiple_choice" && question.correctAnswer && (
                    <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50 shadow-sm">
                        <label className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Зөв хариулт:</label>
                        <div className="font-bold text-emerald-900 text-lg">
                            <MathRenderer content={question.correctAnswer} />
                        </div>
                    </div>
                )}

                {/* Solution */}
                {question.solution && (
                    <div className="pt-6 border-t border-slate-200 space-y-3">
                        <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block ml-1">Бодолт / Тайлбар:</label>
                        <div className="text-sm text-slate-600 leading-relaxed bg-blue-50/50 p-4 rounded-xl border border-blue-100 shadow-sm">
                            <MathRenderer content={question.solution} />
                        </div>
                        {question.solutionMediaUrl && (
                            <div className="rounded-xl overflow-hidden border border-slate-200 bg-white p-2 mt-2 shadow-sm">
                                <img
                                    src={question.solutionMediaUrl}
                                    className="w-full h-auto max-h-[200px] object-contain rounded-lg"
                                    alt="Solution media"
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
