'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BlogImageField from './BlogImageField';
import type { BlogContentBlock } from '@/data/blog';

type Props = {
    blocks: BlogContentBlock[];
    onChange: (blocks: BlogContentBlock[]) => void;
    l: (ru: string, en: string, lv: string) => string;
};

const BLOCK_LABELS: Record<BlogContentBlock['type'], [string, string, string]> = {
    heading: ['Заголовок', 'Heading', 'Virsraksts'],
    paragraph: ['Абзац', 'Paragraph', 'Rindkopa'],
    list: ['Список', 'List', 'Saraksts'],
    quote: ['Цитата', 'Quote', 'Citāts'],
    image: ['Картинка', 'Image', 'Attēls'],
    gallery: ['Галерея', 'Gallery', 'Galerija'],
};

const BLOCK_TYPES = Object.keys(BLOCK_LABELS) as BlogContentBlock['type'][];

function makeDefaultBlock(type: BlogContentBlock['type']): BlogContentBlock {
    switch (type) {
        case 'heading':
            return { type: 'heading', level: 2, text: '' };
        case 'paragraph':
            return { type: 'paragraph', text: '' };
        case 'list':
            return { type: 'list', ordered: false, items: [''] };
        case 'quote':
            return { type: 'quote', text: '', author: '' };
        case 'image':
            return { type: 'image', src: '', alt: '', caption: '' };
        case 'gallery':
            return { type: 'gallery', images: [{ src: '', alt: '', caption: '' }] };
    }
}

export default function BlogContentBlocksEditor({ blocks, onChange, l }: Props): React.ReactElement {
    const [addType, setAddType] = React.useState<BlogContentBlock['type']>('paragraph');

    const updateBlock = (index: number, next: BlogContentBlock): void => {
        onChange(blocks.map((b, i) => (i === index ? next : b)));
    };

    const removeBlock = (index: number): void => {
        onChange(blocks.filter((_, i) => i !== index));
    };

    const moveBlock = (index: number, direction: -1 | 1): void => {
        const target = index + direction;
        if (target < 0 || target >= blocks.length) return;
        const next = [...blocks];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    const addBlock = (): void => {
        onChange([...blocks, makeDefaultBlock(addType)]);
    };

    return (
        <div className="md:col-span-2 space-y-3">
            <span className="block text-sm text-muted-foreground">
                {l('Содержимое статьи', 'Article content', 'Raksta saturs')}
            </span>

            {blocks.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                    {l('Блоков пока нет — добавьте первый ниже.', 'No blocks yet — add the first one below.', 'Vēl nav bloku — pievienojiet pirmo zemāk.')}
                </p>
            )}

            <div className="space-y-3">
                {blocks.map((block, index) => (
                    <div key={index} className="rounded-md border border-border bg-card p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                                {l(...BLOCK_LABELS[block.type])}
                            </span>
                            <div className="flex items-center gap-1">
                                <Button type="button" variant="ghost" size="sm" className="px-2" disabled={index === 0} onClick={() => moveBlock(index, -1)} aria-label="up">
                                    ↑
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="px-2" disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)} aria-label="down">
                                    ↓
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="px-2 text-destructive" onClick={() => removeBlock(index)} aria-label="remove">
                                    ✕
                                </Button>
                            </div>
                        </div>

                        {block.type === 'heading' && (
                            <div className="flex gap-2">
                                <Select
                                    value={String(block.level)}
                                    onValueChange={(v) => updateBlock(index, { ...block, level: Number(v) as 1 | 2 | 3 })}
                                >
                                    <SelectTrigger className="w-20 shrink-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">H1</SelectItem>
                                        <SelectItem value="2">H2</SelectItem>
                                        <SelectItem value="3">H3</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={block.text}
                                    onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                                    placeholder={l('Текст заголовка', 'Heading text', 'Virsraksta teksts')}
                                    className="flex-1"
                                />
                            </div>
                        )}

                        {block.type === 'paragraph' && (
                            <Textarea
                                value={block.text}
                                onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                                placeholder={l('Текст абзаца', 'Paragraph text', 'Rindkopas teksts')}
                                className="min-h-[90px]"
                            />
                        )}

                        {block.type === 'list' && (
                            <div className="space-y-2">
                                <label className="inline-flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={Boolean(block.ordered)}
                                        onCheckedChange={(checked) => updateBlock(index, { ...block, ordered: checked === true })}
                                    />
                                    {l('Нумерованный', 'Ordered', 'Numurēts')}
                                </label>
                                {block.items.map((item, itemIndex) => (
                                    <div key={itemIndex} className="flex gap-2">
                                        <Input
                                            value={item}
                                            onChange={(e) =>
                                                updateBlock(index, {
                                                    ...block,
                                                    items: block.items.map((v, i) => (i === itemIndex ? e.target.value : v)),
                                                })
                                            }
                                            placeholder={l('Пункт списка', 'List item', 'Saraksta vienums')}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateBlock(index, { ...block, items: block.items.filter((_, i) => i !== itemIndex) })}
                                            disabled={block.items.length <= 1}
                                        >
                                            ✕
                                        </Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => updateBlock(index, { ...block, items: [...block.items, ''] })}>
                                    + {l('Пункт', 'Item', 'Vienums')}
                                </Button>
                            </div>
                        )}

                        {block.type === 'quote' && (
                            <div className="space-y-2">
                                <Textarea
                                    value={block.text}
                                    onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                                    placeholder={l('Текст цитаты', 'Quote text', 'Citāta teksts')}
                                    className="min-h-[70px]"
                                />
                                <Input
                                    value={block.author ?? ''}
                                    onChange={(e) => updateBlock(index, { ...block, author: e.target.value })}
                                    placeholder={l('Автор цитаты (необязательно)', 'Quote author (optional)', 'Citāta autors (neobligāti)')}
                                />
                            </div>
                        )}

                        {block.type === 'image' && (
                            <div className="space-y-2">
                                <BlogImageField
                                    id={`block-image-${index}`}
                                    label={l('Картинка', 'Image', 'Attēls')}
                                    value={block.src}
                                    onChange={(path) => updateBlock(index, { ...block, src: path })}
                                    l={l}
                                    placeholder="/blog/image.jpg"
                                />
                                <Input
                                    value={block.alt}
                                    onChange={(e) => updateBlock(index, { ...block, alt: e.target.value })}
                                    placeholder={l('Alt-текст', 'Alt text', 'Alt teksts')}
                                />
                                <Input
                                    value={block.caption ?? ''}
                                    onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                                    placeholder={l('Подпись (необязательно)', 'Caption (optional)', 'Paraksts (neobligāti)')}
                                />
                            </div>
                        )}

                        {block.type === 'gallery' && (
                            <div className="space-y-3">
                                {block.images.map((image, imageIndex) => (
                                    <div key={imageIndex} className="rounded border border-border/60 p-2 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">
                                                {l('Изображение', 'Image', 'Attēls')} {imageIndex + 1}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="px-2 text-destructive"
                                                onClick={() =>
                                                    updateBlock(index, { ...block, images: block.images.filter((_, i) => i !== imageIndex) })
                                                }
                                                disabled={block.images.length <= 1}
                                            >
                                                ✕
                                            </Button>
                                        </div>
                                        <BlogImageField
                                            id={`gallery-${index}-${imageIndex}`}
                                            label={l('Картинка', 'Image', 'Attēls')}
                                            value={image.src}
                                            onChange={(path) =>
                                                updateBlock(index, {
                                                    ...block,
                                                    images: block.images.map((img, i) => (i === imageIndex ? { ...img, src: path } : img)),
                                                })
                                            }
                                            l={l}
                                            placeholder="/blog/image.jpg"
                                        />
                                        <Input
                                            value={image.alt}
                                            onChange={(e) =>
                                                updateBlock(index, {
                                                    ...block,
                                                    images: block.images.map((img, i) => (i === imageIndex ? { ...img, alt: e.target.value } : img)),
                                                })
                                            }
                                            placeholder={l('Alt-текст', 'Alt text', 'Alt teksts')}
                                        />
                                        <Input
                                            value={image.caption ?? ''}
                                            onChange={(e) =>
                                                updateBlock(index, {
                                                    ...block,
                                                    images: block.images.map((img, i) => (i === imageIndex ? { ...img, caption: e.target.value } : img)),
                                                })
                                            }
                                            placeholder={l('Подпись (необязательно)', 'Caption (optional)', 'Paraksts (neobligāti)')}
                                        />
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateBlock(index, { ...block, images: [...block.images, { src: '', alt: '', caption: '' }] })}
                                >
                                    + {l('Изображение', 'Image', 'Attēls')}
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2">
                <Select value={addType} onValueChange={(v) => setAddType(v as BlogContentBlock['type'])}>
                    <SelectTrigger className="w-auto min-w-[9rem]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {BLOCK_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                                {l(...BLOCK_LABELS[type])}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={addBlock}>
                    + {l('Добавить блок', 'Add block', 'Pievienot bloku')}
                </Button>
            </div>
        </div>
    );
}
