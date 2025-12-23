"use client";

import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

interface MathRendererProps {
    content: string;
}

export default function MathRenderer({ content }: MathRendererProps) {
    // If no math content detected (no $), just return text to avoid overhead, 
    // but react-latex-next handles mixed text/math well.
    return (
        <div className="math-content">
            <Latex>{content}</Latex>
        </div>
    );
}
