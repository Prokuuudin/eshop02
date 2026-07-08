export interface ShareLinks {
    facebook: string;
    x: string;
    telegram: string;
    whatsapp: string;
}

export function buildShareLinks(url: string, title: string): ShareLinks {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    return {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    };
}
