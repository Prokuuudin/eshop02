import Image from 'next/image'
import type { BlogContentBlock } from '@/data/blog'

type Props = { block: BlogContentBlock; index: number; resolveImageSrc: (src: string) => string }

export default function BlogContentBlockRenderer({ block, index, resolveImageSrc }: Props): React.ReactNode {
        if (block.type === 'heading') {
            if (block.level === 1) {
                return (
                    <h1
                        key={index}
                        className="text-3xl font-bold mt-6 mb-3 text-foreground"
                    >
                        {block.text}
                    </h1>
                );
            }
            if (block.level === 2) {
                return (
                    <h2
                        key={index}
                        className="text-2xl font-bold mt-5 mb-2 text-foreground"
                    >
                        {block.text}
                    </h2>
                );
            }
            return (
                <h3
                    key={index}
                    className="text-xl font-semibold mt-4 mb-2 text-foreground"
                >
                    {block.text}
                </h3>
            );
        }

        if (block.type === 'paragraph') {
            return (
                <p key={index} className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {block.text}
                </p>
            );
        }

        if (block.type === 'list') {
            const ListTag = block.ordered ? 'ol' : 'ul';
            const listClass = block.ordered
                ? 'list-decimal pl-6 space-y-2 text-gray-700 dark:text-gray-300'
                : 'list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300';

            return (
                <ListTag key={index} className={listClass}>
                    {block.items.map((item, itemIndex) => (
                        <li key={`${index}-${itemIndex}`}>{item}</li>
                    ))}
                </ListTag>
            );
        }

        if (block.type === 'image') {
            return (
                <figure key={index} className="space-y-2">
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-border">
                        <Image
                            src={resolveImageSrc(block.src)}
                            alt={block.alt}
                            fill
                            className="object-cover"
                        />
                    </div>
                    {block.caption && (
                        <figcaption className="text-sm text-muted-foreground">
                            {block.caption}
                        </figcaption>
                    )}
                </figure>
            );
        }

        if (block.type === 'gallery') {
            return (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {block.images.map((image, imageIndex) => (
                        <figure key={`${index}-${imageIndex}`} className="space-y-2">
                            <div className="relative aspect-video rounded-lg overflow-hidden border border-border">
                                <Image
                                    src={resolveImageSrc(image.src)}
                                    alt={image.alt}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            {image.caption && (
                                <figcaption className="text-sm text-muted-foreground">
                                    {image.caption}
                                </figcaption>
                            )}
                        </figure>
                    ))}
                </div>
            );
        }

        if (block.type === 'quote') {
            return (
                <blockquote
                    key={index}
                    className="rounded-lg border-l-4 border-primary bg-primary/5 dark:bg-primary/15 px-4 py-3 text-gray-800 dark:text-gray-200"
                >
                    <p className="italic">{block.text}</p>
                    {block.author && (
                        <footer className="mt-2 text-sm text-muted-foreground">
                            - {block.author}
                        </footer>
                    )}
                </blockquote>
            );
        }

        return null;
    }
