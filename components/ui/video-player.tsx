import * as React from 'react';

export interface VideoPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
    src: string;
    poster?: string;
    className?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    src,
    poster,
    className = '',
    ...props
}) => {
    return (
        <div
            className={`video-player aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-black ${className}`}
        >
            <video
                src={src}
                poster={poster}
                controls
                className="w-full h-full object-cover bg-black"
                preload="metadata"
                {...props}
            />
        </div>
    );
};

export default VideoPlayer;
