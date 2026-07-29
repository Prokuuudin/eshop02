import * as React from 'react';

export interface VideoPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
    src: string;
    poster?: string;
    className?: string;
    captionsSrc?: string;
    captionsLabel?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    src,
    poster,
    className = '',
    captionsSrc,
    captionsLabel = 'Captions',
    ...props
}) => {
    return (
        <div
            className={`video-player aspect-video rounded-lg overflow-hidden border border-border bg-black ${className}`}
        >
            <video
                src={src}
                poster={poster}
                controls
                className="w-full h-full object-cover bg-black"
                preload="metadata"
                {...props}
            >
                <track kind="captions" src={captionsSrc} srcLang="en" label={captionsLabel} />
            </video>
        </div>
    );
};

export default VideoPlayer;
