'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/lib/utils';
import AdminGate from '@/components/admin/AdminGate';
import { logout } from '@/lib/auth';

import { useAdminBlogPage } from './useAdminBlogPage';
import BlogPostForm from './BlogPostForm';

export default function AdminBlogPage(): React.ReactElement {
    const pageState = useAdminBlogPage();
    const {
        router,
        t,
        l,
        tl,
        locale,
        blogPosts,
        blogLoading,
        editingBlogId,
        handleBlogDelete,
        handleStartEditBlog,
        handleCancelBlogEdit,
    } = pageState;

    const [showForm, setShowForm] = React.useState(false);

    const [search, setSearch] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<'all' | 'draft' | 'published'>('all');

    const categories = React.useMemo(
        () => Array.from(new Set(blogPosts.map((post) => post.category))).sort(),
        [blogPosts]
    );
    const [categoryFilter, setCategoryFilter] = React.useState('all');

    const filteredPosts = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return blogPosts.filter((post) => {
            if (statusFilter !== 'all' && (post.status ?? 'published') !== statusFilter) return false;
            if (categoryFilter !== 'all' && post.category !== categoryFilter) return false;
            if (q && !post.title.toLowerCase().includes(q) && !post.slug.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [blogPosts, search, statusFilter, categoryFilter]);

    return (
        <AdminGate>
            <main className="admin-blog-page w-full py-4 text-foreground">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {tl(
                                'admin.blog.title',
                                'Управление блогом',
                                'Blog management',
                                'Bloga pārvaldība'
                            )}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {tl(
                                'admin.blog.subtitle',
                                'Создание, редактирование и удаление статей',
                                'Create, edit, and delete posts',
                                'Rakstu izveide, rediģēšana un dzēšana'
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/admin">
                            <Button variant="outline">
                                {tl(
                                    'admin.blog.backToAdmin',
                                    'Назад в админ-панель',
                                    'Back to admin panel',
                                    'Atpakaļ uz administrēšanas paneli'
                                )}
                            </Button>
                        </Link>
                        <Button
                            variant="outline"
                            onClick={() => {
                                logout();
                                router.push('/');
                            }}
                        >
                            {t('auth.logout')}
                        </Button>
                    </div>
                </div>

                <div className="bg-card rounded-lg border border-border p-6 mt-8">
                    {!showForm && (
                        <Button type="button" className="mb-6" onClick={() => setShowForm(true)}>
                            + {tl('admin.blog.addPost', 'Добавить статью', 'Add post', 'Pievienot rakstu')}
                        </Button>
                    )}
                    <Accordion
                        type="single"
                        collapsible
                        value={showForm ? 'post-form' : ''}
                        onValueChange={(v) => setShowForm(v === 'post-form')}
                    >
                        <AccordionItem value="post-form" className="border-0">
                            <AccordionContent className="pt-0">
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h2 className="text-lg font-semibold">
                                            {editingBlogId
                                                ? tl('admin.blog.editPostTitle', 'Редактирование статьи', 'Edit post', 'Raksta rediģēšana')
                                                : tl('admin.blog.newPostTitle', 'Новая статья', 'New post', 'Jauns raksts')}
                                        </h2>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                if (editingBlogId) handleCancelBlogEdit();
                                                setShowForm(false);
                                            }}
                                        >
                                            {l('Свернуть', 'Collapse', 'Sakļaut')}
                                        </Button>
                                    </div>
                                    <BlogPostForm state={pageState} />
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>

                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            {tl(
                                'admin.blog.postsList',
                                'Список статей',
                                'Posts list',
                                'Rakstu saraksts'
                            )}
                            {!blogLoading && ` (${filteredPosts.length}/${blogPosts.length})`}
                        </h3>

                        <div className="flex flex-wrap gap-2 mb-4">
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={l('Поиск по заголовку или slug…', 'Search by title or slug…', 'Meklēt pēc virsraksta vai slug…')}
                                className="max-w-xs"
                            />
                            <Select
                                value={statusFilter}
                                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
                            >
                                <SelectTrigger className="w-auto min-w-[10rem]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{l('Все статусы', 'All statuses', 'Visi statusi')}</SelectItem>
                                    <SelectItem value="published">{l('Опубликовано', 'Published', 'Publicēts')}</SelectItem>
                                    <SelectItem value="draft">{l('Черновик', 'Draft', 'Melnraksts')}</SelectItem>
                                </SelectContent>
                            </Select>
                            {categories.length > 0 && (
                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger className="w-auto min-w-[10rem]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{l('Все категории', 'All categories', 'Visas kategorijas')}</SelectItem>
                                        {categories.map((category) => (
                                            <SelectItem key={category} value={category}>
                                                {category}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {blogLoading ? (
                            <p className="text-muted-foreground">
                                {tl('admin.blog.loading', 'Загрузка...', 'Loading...', 'Ielāde...')}
                            </p>
                        ) : blogPosts.length === 0 ? (
                            <p className="text-muted-foreground">
                                {tl(
                                    'admin.blog.empty',
                                    'Статей пока нет',
                                    'No posts yet',
                                    'Rakstu vēl nav'
                                )}
                            </p>
                        ) : filteredPosts.length === 0 ? (
                            <p className="text-muted-foreground">
                                {l('Под фильтр ничего не подошло', 'Nothing matches the filter', 'Filtram nekas neatbilst')}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {filteredPosts.map((post) => (
                                    <div
                                        key={post.id}
                                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded border border-border p-3"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-muted">
                                                {post.image && (
                                                    <Image
                                                        unoptimized
                                                        src={post.image}
                                                        alt=""
                                                        width={64}
                                                        height={48}
                                                        className="h-full w-full object-cover"
                                                    />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{post.title}</p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    /{post.slug} • {post.category} • {formatDate(post.createdAt, locale)}
                                                    {post.status === 'draft' && (
                                                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                                                            {l('черновик', 'draft', 'melnraksts')}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    handleStartEditBlog(post);
                                                    setShowForm(true);
                                                }}
                                            >
                                                {tl(
                                                    'admin.blog.edit',
                                                    'Редактировать',
                                                    'Edit',
                                                    'Rediģēt'
                                                )}
                                            </Button>
                                            <a
                                                href={`/blog/${post.slug}`}
                                                className="text-sm text-primary hover:underline"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {tl('admin.blog.open', 'Открыть', 'Open', 'Atvērt')}
                                            </a>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleBlogDelete(post.id)}
                                            >
                                                {tl(
                                                    'admin.blog.delete',
                                                    'Удалить',
                                                    'Delete',
                                                    'Dzēst'
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </AdminGate>
    );
}
