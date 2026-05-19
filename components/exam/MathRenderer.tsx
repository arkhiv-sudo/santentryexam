"use client";

import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

interface MathRendererProps {
    content: string;
}

// FIX 15: Sanitize LaTeX input to block dangerous macros that could be used to
// exfiltrate data, link to malicious URLs, or attempt arbitrary file I/O via
// TeX engine extensions. KaTeX's `trust: false` covers most attacks, but we
// also pre-filter user input as defense-in-depth.
function sanitizeLatex(input: string): string {
    if (!input) return '';
    let s = String(input);
    // Block dangerous LaTeX commands that could execute scripts or link out
    const blockedCommands = [
        'href', 'url', 'includegraphics', 'input', 'include',
        'write', 'openout', 'closeout', 'read', 'openin', 'closein',
    ];
    for (const cmd of blockedCommands) {
        const re = new RegExp(`\\\\${cmd}\\b`, 'gi');
        s = s.replace(re, `\\text{[${cmd} blocked]}`);
    }
    // Block javascript: URLs anywhere
    s = s.replace(/javascript:/gi, 'blocked:');
    return s;
}

export default function MathRenderer({ content }: MathRendererProps) {
    if (!content) return null;

    // FIX 15: sanitize before any LaTeX parsing
    const safeContent = sanitizeLatex(content);

    // Function to wrap triple backtick blocks in styled div
    const processCodeBlocks = (text: string) => {
        const parts = text.split(/(```[\s\S]*?```)/g);
        return parts.map((part, index) => {
            if (part.startsWith('```') && part.endsWith('```')) {
                const code = part.slice(3, -3).trim();
                // Extract language if present
                const lines = code.split('\n');
                const firstLine = lines[0].trim();
                const hasLang = /^[a-z]+$/i.test(firstLine);
                const displayCode = hasLang ? lines.slice(1).join('\n') : code;

                return (
                    <div key={index} className="my-4 relative group">
                        <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-sm overflow-x-auto border border-slate-800 shadow-inner">
                            {hasLang && <span className="absolute top-2 right-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{firstLine}</span>}
                            <code>{displayCode}</code>
                        </pre>
                    </div>
                );
            }

            // For parts outside code blocks, we also handle inline code `like this`
            const inlineParts = part.split(/(`[^`]+`)/g);
            return inlineParts.map((inlinePart, i) => {
                if (inlinePart.startsWith('`') && inlinePart.endsWith('`')) {
                    return (
                        <code key={`${index}-${i}`} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono text-[0.9em] border border-slate-200">
                            {inlinePart.slice(1, -1)}
                        </code>
                    );
                }
                return <Latex key={`${index}-${i}`}>{inlinePart}</Latex>;
            });
        });
    };

    return (
        <div className="math-content break-words whitespace-pre-wrap leading-relaxed transition-all duration-200">
            {processCodeBlocks(safeContent)}
        </div>
    );
}
