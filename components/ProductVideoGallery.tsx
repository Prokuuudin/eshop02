import React from 'react';
import Image from 'next/image';
import VideoPlayer from '@/components/ui/video-player';

interface ProductVideoGalleryProps {
    demoVideos: { src: string; poster?: string }[];
    title: string;
    fallbackPoster?: string;
}

// Видео из nopCommerce-миграции — это embed-URL (Facebook/YouTube/Vimeo), их
// играем через iframe; прямые файлы (mp4 и т.п.) — через <video>.
const isEmbedUrl = (src: string): boolean =>
    /(facebook\.com\/plugins\/video|youtube(-nocookie)?\.com\/embed|player\.vimeo\.com\/video)/i.test(src);

export const ProductVideoGallery: React.FC<ProductVideoGalleryProps> = ({
    demoVideos,
    title,
    fallbackPoster,
}) => {
    const [activeVideo, setActiveVideo] = React.useState(0);

    return (
        <div className="mb-4 mt-4">
            {isEmbedUrl(demoVideos[activeVideo].src) ? (
                <div className="aspect-video rounded-lg overflow-hidden border border-border bg-black">
                    <iframe
                        key={demoVideos[activeVideo].src}
                        src={demoVideos[activeVideo].src}
                        title={`${title} — видео ${activeVideo + 1}`}
                        className="w-full h-full"
                        frameBorder="0"
                        loading="lazy"
                        allow="autoplay; encrypted-media; picture-in-picture; web-share"
                        allowFullScreen
                    />
                </div>
            ) : (
                <VideoPlayer
                    src={demoVideos[activeVideo].src}
                    poster={demoVideos[activeVideo].poster || fallbackPoster}
                />
            )}
            {demoVideos.length > 1 && (
                <div className="flex gap-2 mt-3 justify-center">
                    {demoVideos.map((video, idx) => (
                        <button
                            key={video.src}
                            type="button"
                            className={`rounded border-2 transition-all ${
                                activeVideo === idx
                                    ? 'border-primary ring-2 ring-primary/50'
                                    : 'border-transparent opacity-70 hover:opacity-100'
                            } bg-white`}
                            style={{ width: 80, height: 48, overflow: 'hidden' }}
                            onClick={() => setActiveVideo(idx)}
                            aria-label={`Показать видео ${idx + 1}`}
                        >
                            {video.poster ? (
                                <Image
                                    unoptimized
                                    src={video.poster}
                                    alt={`Видео превью ${idx + 1}`}
                                    width={80}
                                    height={48}
                                    style={{ objectFit: 'cover', width: 80, height: 48 }}
                                />
                            ) : (
                                <span className="flex items-center justify-center w-full h-full text-xs text-gray-500">
                                    Видео {idx + 1}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
