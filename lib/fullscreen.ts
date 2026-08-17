/**
 * Бүтэн дэлгэц (fullscreen) туслах функцууд.
 *
 * ЧУХАЛ: `requestFullscreen()`-ыг ЗААВАЛ хэрэглэгчийн үйлдлийн (click) дотор,
 * ямар нэг `await`-аас ӨМНӨ дуудах ёстой. Effect дотроос эсвэл setTimeout/await-ын
 * дараа дуудвал Chrome (ялангуяа Chromebook) "user gesture" алдагдсан гэж үзээд
 * татгалзана.
 */

/** Хуучин webkit prefix-тэй browser-уудад зориулсан нэмэлт типүүд */
interface FullscreenCapableElement extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenCapableDocument extends Document {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
}

/** Одоо бүтэн дэлгэц идэвхтэй эсэх */
export function isFullscreenActive(): boolean {
    if (typeof document === "undefined") return false;
    const doc = document as FullscreenCapableDocument;
    return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.msFullscreenElement);
}

/**
 * Бүтэн дэлгэц рүү шилжих оролдлого хийнэ.
 * Амжилтгүй болсон ч ХЭЗЭЭ Ч throw хийхгүй — `false` буцаана.
 * Заавал хэрэглэгчийн товшилтын дотор (await-аас өмнө) дуудна.
 */
export function requestFullscreen(): Promise<boolean> {
    if (typeof document === "undefined") return Promise.resolve(false);

    const el = document.documentElement as FullscreenCapableElement;
    const request =
        el.requestFullscreen?.bind(el) ??
        el.webkitRequestFullscreen?.bind(el) ??
        el.webkitRequestFullScreen?.bind(el) ??
        el.msRequestFullscreen?.bind(el);

    if (!request) return Promise.resolve(false);

    try {
        // Зарим browser (хуучин Safari) Promise буцаадаггүй тул нэмж боож өгнө.
        return Promise.resolve(request())
            .then(() => true)
            .catch(() => false);
    } catch {
        return Promise.resolve(false);
    }
}

/**
 * Бүтэн дэлгэцээс гарна. Алдаа гарвал чимээгүй залгина.
 */
export function exitFullscreen(): Promise<void> {
    if (typeof document === "undefined") return Promise.resolve();
    if (!isFullscreenActive()) return Promise.resolve();

    const doc = document as FullscreenCapableDocument;
    const exit =
        doc.exitFullscreen?.bind(doc) ??
        doc.webkitExitFullscreen?.bind(doc) ??
        doc.msExitFullscreen?.bind(doc);

    if (!exit) return Promise.resolve();

    try {
        return Promise.resolve(exit()).then(
            () => undefined,
            () => undefined,
        );
    } catch {
        return Promise.resolve();
    }
}

/**
 * `fullscreenchange` (+ webkit хувилбар) event-д бүртгүүлж, цэвэрлэх функц буцаана.
 */
export function onFullscreenChange(handler: () => void): () => void {
    if (typeof document === "undefined") return () => {};
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    document.addEventListener("MSFullscreenChange", handler);
    return () => {
        document.removeEventListener("fullscreenchange", handler);
        document.removeEventListener("webkitfullscreenchange", handler);
        document.removeEventListener("MSFullscreenChange", handler);
    };
}
