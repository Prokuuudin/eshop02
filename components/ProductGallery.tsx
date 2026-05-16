import React from 'react';
import Image from 'next/image';
import VideoPlayer from '@/components/ui/video-player';

interface ProductGalleryProps {
    images: string[];
    demoVideos?: { src: string; poster?: string }[];
    title: string;
}

export const ProductGallery: React.FC<ProductGalleryProps> = ({
    images,
    demoVideos = [],
    title,
}) => {
    const [activeImage, setActiveImage] = React.useState(0);
    const [activeVideo, setActiveVideo] = React.useState(0);

    return (
        <div className="product-detail__image">
            {/* Галерея видео, если есть */}
            {demoVideos.length > 0 && (
                <div className="mb-4">
                    <VideoPlayer
                        src={demoVideos[activeVideo].src}
                        poster={demoVideos[activeVideo].poster || images[0] || undefined}
                    />
                    {demoVideos.length > 1 && (
                        <div className="flex gap-2 mt-3 justify-center">
                            {demoVideos.map((video, idx) => (
                                <button
                                    key={video.src}
                                    type="button"
                                    className={`rounded border-2 transition-all ${
                                        activeVideo === idx
                                            ? 'border-indigo-600 ring-2 ring-indigo-300'
                                            : 'border-transparent opacity-70 hover:opacity-100'
                                    } bg-white`}
                                    style={{ width: 80, height: 48, overflow: 'hidden' }}
                                    onClick={() => setActiveVideo(idx)}
                                    aria-label={`Показать видео ${idx + 1}`}
                                >
                                    {video.poster ? (
                                        <img
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
            )}
            {/* Галерея изображений */}
            <div className="relative mx-auto w-1/2 aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                {images.length > 0 && (
                    <Image
                        key={images[activeImage]}
                        src={images[activeImage]}
                        alt={title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 25vw"
                    />
                )}
            </div>
            {images.length > 1 && (
                <div className="product-detail__thumbs flex gap-2 mt-3 justify-center">
                    {images.map((img, idx) => (
                        <button
                            key={img}
                            type="button"
                            className={`product-detail__thumb rounded border-2 transition-all ${
                                activeImage === idx
                                    ? 'border-indigo-600 ring-2 ring-indigo-300'
                                    : 'border-transparent opacity-70 hover:opacity-100'
                            } bg-white`}
                            style={{ width: 48, height: 48, overflow: 'hidden' }}
                            onClick={() => setActiveImage(idx)}
                            aria-label={`Показать изображение ${idx + 1}`}
                        >
                            <Image
                                src={img}
                                alt={title + ' preview'}
                                width={48}
                                height={48}
                                className="object-cover"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
