'use client';
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
        tl,
        locale,
        blogPosts,
        blogLoading,
        handleBlogDelete,
        handleStartEditBlog,
    } = pageState;
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
                    <BlogPostForm state={pageState} />

                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            {tl(
                                'admin.blog.postsList',
                                'Список статей',
                                'Posts list',
                                'Rakstu saraksts'
                            )}
                        </h3>
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
                        ) : (
                            <div className="space-y-2">
                                {blogPosts.map((post) => (
                                    <div
                                        key={post.id}
                                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded border border-border p-3"
                                    >
                                        <div>
                                            <p className="font-medium">{post.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                /{post.slug} • {formatDate(post.createdAt, locale)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleStartEditBlog(post)}
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
