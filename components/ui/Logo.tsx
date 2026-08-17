/**
 * Санте шалгалтын системийн лого.
 *
 * Шар дүүргэлттэй, тэнгисийн цэнхэр хүрээтэй тойрог дотор хоёр хэвтээ зураас
 * «S» үсгийг үүсгэнэ. Inline SVG тул хаана ч тод, ямар ч хэмжээнд харагдана
 * (favicon-ы эх сурвалж нь public/logo.svg + app/icon.svg).
 */

export const LOGO_NAVY = "#12126E";
export const LOGO_YELLOW = "#FFF95C";

export function Logo({
    size = 32,
    className = "",
    title = "Шалгалтын Систем",
}: {
    size?: number;
    className?: string;
    title?: string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            role="img"
            aria-label={title}
            className={className}
            xmlns="http://www.w3.org/2000/svg"
        >
            <circle cx="50" cy="50" r="45" fill={LOGO_YELLOW} stroke={LOGO_NAVY} strokeWidth="2.8" />
            {/* дээд зураас — зүүн талдаа завсартай, баруун талаараа хүрээнд хүрнэ */}
            <path d="M34.8 33.8 H 91.5" stroke={LOGO_NAVY} strokeWidth="2.6" strokeLinecap="butt" />
            {/* доод зураас — зүүн талаараа хүрээнд хүрч, баруун талдаа завсартай */}
            <path d="M9.2 64.7 H 66" stroke={LOGO_NAVY} strokeWidth="2.6" strokeLinecap="butt" />
        </svg>
    );
}

export default Logo;
