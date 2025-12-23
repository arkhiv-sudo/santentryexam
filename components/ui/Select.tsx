import * as React from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
    value: string;
    label: string;
}

export interface SelectProps {
    label?: string;
    error?: string;
    value?: string;
    defaultValue?: string;
    onChange?: (e: { target: { value: string } }) => void;
    options?: SelectOption[];
    children?: React.ReactNode;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    required?: boolean;
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
    ({ className, label, error, value: propsValue, defaultValue, onChange, options: propsOptions, children, placeholder = "Сонгох...", disabled, required, ...props }, ref) => {
        const [isOpen, setIsOpen] = React.useState(false);
        const [internalValue, setInternalValue] = React.useState(propsValue || defaultValue || "");
        const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 });
        const containerRef = React.useRef<HTMLDivElement>(null);
        const triggerRef = React.useRef<HTMLButtonElement>(null);
        const popoverRef = React.useRef<HTMLDivElement>(null);

        // Sync internal value
        React.useEffect(() => {
            if (propsValue !== undefined) setInternalValue(propsValue);
        }, [propsValue]);

        const value = propsValue !== undefined ? propsValue : internalValue;

        const options = React.useMemo(() => {
            if (propsOptions) return propsOptions;
            const extracted: SelectOption[] = [];
            React.Children.forEach(children, (child) => {
                if (React.isValidElement(child) && child.type === "option") {
                    const p = child.props as any;
                    extracted.push({ value: String(p.value), label: String(p.children) });
                }
            });
            return extracted;
        }, [propsOptions, children]);

        const selectedOption = options.find((opt) => opt.value === value);

        // Positioning logic
        const updateCoords = () => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + window.scrollY,
                    left: rect.left + window.scrollX,
                    width: rect.width
                });
            }
        };

        React.useEffect(() => {
            if (isOpen) {
                updateCoords();
                window.addEventListener("scroll", updateCoords);
                window.addEventListener("resize", updateCoords);
            }
            return () => {
                window.removeEventListener("scroll", updateCoords);
                window.removeEventListener("resize", updateCoords);
            };
        }, [isOpen]);

        React.useEffect(() => {
            const handleClickOutside = (e: MouseEvent) => {
                const target = e.target as Node;
                const isInsideContainer = containerRef.current && containerRef.current.contains(target);
                const isInsidePopover = popoverRef.current && popoverRef.current.contains(target);

                if (!isInsideContainer && !isInsidePopover) {
                    setIsOpen(false);
                }
            };
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }, []);

        const handleSelect = (val: string) => {
            if (onChange) onChange({ target: { value: val } } as any);
            setIsOpen(false);
        };

        return (
            <div className="w-full" ref={containerRef}>
                {label && (
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        {label}
                    </label>
                )}
                <div className="relative">
                    <button
                        ref={triggerRef}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                            if (!isOpen) updateCoords();
                            setIsOpen(!isOpen);
                        }}
                        className={clsx(
                            "w-full flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 text-left transition-all duration-200",
                            "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                            isOpen && "border-blue-500 ring-2 ring-blue-500/20",
                            disabled && "cursor-not-allowed opacity-50 bg-slate-50",
                            error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
                            className
                        )}
                    >
                        <span className={clsx(!selectedOption && "text-slate-400")}>
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                        <ChevronDown className={clsx("w-4 h-4 text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} />
                    </button>

                    {isOpen && coords.width > 0 && typeof document !== "undefined" && createPortal(
                        <div
                            ref={popoverRef}
                            className="absolute z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                            style={{
                                top: coords.top + 8,
                                left: coords.left,
                                width: coords.width
                            }}
                        >
                            <ul className="max-h-60 overflow-y-auto py-1">
                                {options.length === 0 ? (
                                    <li className="px-4 py-2 text-sm text-slate-400">Сонголт олдсонгүй</li>
                                ) : (
                                    options.map((option) => (
                                        <li
                                            key={option.value}
                                            onClick={() => handleSelect(option.value)}
                                            className={clsx(
                                                "flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer transition-colors",
                                                value === option.value
                                                    ? "bg-blue-50 text-blue-700 font-medium"
                                                    : "text-slate-700 hover:bg-slate-50"
                                            )}
                                        >
                                            {option.label}
                                            {value === option.value && <Check className="w-4 h-4" />}
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>,
                        document.body
                    )}
                </div>
                {error && (
                    <p className="mt-1.5 text-sm text-red-600">{error}</p>
                )}
            </div>
        );
    }
);

Select.displayName = "Select";

export { Select };
