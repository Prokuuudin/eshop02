'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import AdminGate from '@/components/admin/AdminGate'
import { logout } from '@/lib/auth'

type AdminBlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string
  author: string
  image: string
  category: string
  readTime: number
  content: string
  contentBlocks?: unknown[]
  createdAt: string
  featured?: boolean
}

type AdminBlogForm = {
  id?: string
  slug: string
  title: string
  excerpt: string
  author: string
  image: string
  category: string
  readTime: number
  content: string
  featured: boolean
  createdAt?: string
  contentBlocksJson: string
}

const INITIAL_BLOG_FORM: AdminBlogForm = {
  id: undefined,
  slug: '',
  title: '',
  excerpt: '',
  author: '',
  image: '/blog/skincare-guide.jpg',
  category: 'уход за лицом',
  readTime: 4,
  content: '',
  featured: false,
  createdAt: undefined,
  contentBlocksJson: '[]'
}

export default function AdminBlogPage() {
  const router = useRouter()
  const { language, t } = useTranslation()
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'

  const [blogPosts, setBlogPosts] = useState<AdminBlogPost[]>([])
  const [blogLoading, setBlogLoading] = useState(false)
  const [blogSaving, setBlogSaving] = useState(false)
  const [blogMessage, setBlogMessage] = useState('')
  const [blogError, setBlogError] = useState('')
  const [blogForm, setBlogForm] = useState<AdminBlogForm>(INITIAL_BLOG_FORM)
  const [editingBlogId, setEditingBlogId] = useState<string | null>(null)

  const loadBlogPosts = async (): Promise<void> => {
    setBlogLoading(true)
    setBlogError('')
    try {
      const response = await fetch('/api/admin/blog', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('failed_to_load_blog_posts')
      }

      const data = (await response.json()) as { posts?: AdminBlogPost[] }
      setBlogPosts(data.posts ?? [])
    } catch {
      setBlogError('Не удалось загрузить статьи блога')
    } finally {
      setBlogLoading(false)
    }
  }

  useEffect(() => {
    void loadBlogPosts()
  }, [])

  const handleBlogCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBlogSaving(true)
    setBlogError('')
    setBlogMessage('')

    try {
      let contentBlocks: unknown[]
      try {
        contentBlocks = JSON.parse(blogForm.contentBlocksJson) as unknown[]
      } catch (parseError) {
        if (parseError instanceof Error) {
          setBlogError(`Невалидный JSON: ${parseError.message}`)
          return
        }
        setBlogError('Невалидный JSON в contentBlocks')
        return
      }

      if (!Array.isArray(contentBlocks)) {
        setBlogError('contentBlocks JSON должен быть массивом блоков')
        return
      }

      const payload = {
        id: blogForm.id,
        slug: blogForm.slug,
        title: blogForm.title,
        excerpt: blogForm.excerpt,
        author: blogForm.author,
        image: blogForm.image,
        category: blogForm.category,
        readTime: Number(blogForm.readTime),
        content: blogForm.content,
        featured: blogForm.featured,
        createdAt: blogForm.createdAt,
        contentBlocks
      }

      const response = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'save_failed')
      }

      setBlogMessage(editingBlogId ? 'Статья обновлена' : 'Статья сохранена')
      setBlogForm(INITIAL_BLOG_FORM)
      setEditingBlogId(null)
      await loadBlogPosts()
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Ошибка сохранения'
      setBlogError(`Ошибка сохранения: ${message}`)
    } finally {
      setBlogSaving(false)
    }
  }

  const handleBlogDelete = async (id: string): Promise<void> => {
    setBlogError('')
    setBlogMessage('')

    try {
      const response = await fetch(`/api/admin/blog/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('delete_failed')
      }

      setBlogMessage('Статья удалена')
      if (editingBlogId === id) {
        setEditingBlogId(null)
        setBlogForm(INITIAL_BLOG_FORM)
      }
      await loadBlogPosts()
    } catch {
      setBlogError('Не удалось удалить статью')
    }
  }

  const handleStartEditBlog = (post: AdminBlogPost): void => {
    setEditingBlogId(post.id)
    setBlogMessage('')
    setBlogError('')
    setBlogForm({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      author: post.author,
      image: post.image,
      category: post.category,
      readTime: post.readTime,
      content: post.content,
      featured: Boolean(post.featured),
      createdAt: post.createdAt,
      contentBlocksJson: JSON.stringify(post.contentBlocks ?? [], null, 2)
    })
  }

  const handleCancelBlogEdit = (): void => {
    setEditingBlogId(null)
    setBlogForm(INITIAL_BLOG_FORM)
    setBlogMessage('')
    setBlogError('')
  }

  return (
    <AdminGate>
      <main className="w-full px-4 py-12 text-gray-900 dark:text-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            <Link href="/admin" className="hover:underline">Админ-панель</Link>
            <span className="px-2">/</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">Блог</span>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Управление блогом</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Создание, редактирование и удаление статей</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin">
                <Button variant="outline">Назад в админ-панель</Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  logout()
                  router.push('/')
                }}
              >
                {t('auth.logout')}
              </Button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-8">
            <form onSubmit={handleBlogCreate} className="space-y-4 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">Slug</span>
                  <input
                    value={blogForm.slug}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, slug: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="spring-skin-reset-checklist"
                    required
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">Категория</span>
                  <input
                    value={blogForm.category}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="уход за лицом"
                    required
                  />
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">Заголовок</span>
                  <input
                    value={blogForm.title}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                    required
                  />
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">Краткое описание</span>
                  <textarea
                    value={blogForm.excerpt}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 min-h-[72px]"
                    required
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">Автор</span>
                  <input
                    value={blogForm.author}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, author: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                    required
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">Время чтения (мин)</span>
                  <input
                    type="number"
                    min={1}
                    value={blogForm.readTime}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, readTime: Number(e.target.value) }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                    required
                  />
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">Обложка (путь)</span>
                  <input
                    value={blogForm.image}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, image: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                    placeholder="/blog/skincare-guide.jpg"
                    required
                  />
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">Legacy content (опционально)</span>
                  <textarea
                    value={blogForm.content}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, content: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 min-h-[120px]"
                    placeholder="# Заголовок\n\nТекст..."
                  />
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="block text-gray-600 dark:text-gray-300 mb-1">contentBlocks JSON</span>
                  <textarea
                    value={blogForm.contentBlocksJson}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, contentBlocksJson: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 min-h-[220px] font-mono text-xs"
                    placeholder='[{"type":"paragraph","text":"..."}]'
                    required
                  />
                </label>
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={blogForm.featured}
                  onChange={(e) => setBlogForm((prev) => ({ ...prev, featured: e.target.checked }))}
                />
                Показать как featured
              </label>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={blogSaving}>{blogSaving ? 'Сохранение...' : (editingBlogId ? 'Обновить статью' : 'Сохранить статью')}</Button>
                {editingBlogId && (
                  <Button type="button" variant="outline" onClick={handleCancelBlogEdit}>Отменить редактирование</Button>
                )}
                {blogMessage && <span className="text-sm text-green-700">{blogMessage}</span>}
                {blogError && <span className="text-sm text-red-600">{blogError}</span>}
              </div>
            </form>

            <div>
              <h3 className="text-lg font-semibold mb-3">Список статей</h3>
              {blogLoading ? (
                <p className="text-gray-600 dark:text-gray-300">Загрузка...</p>
              ) : blogPosts.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-300">Статей пока нет</p>
              ) : (
                <div className="space-y-2">
                  {blogPosts.map((post) => (
                    <div key={post.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded border border-gray-200 dark:border-gray-700 p-3">
                      <div>
                        <p className="font-medium">{post.title}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">/{post.slug} • {formatDate(post.createdAt, locale)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleStartEditBlog(post)}>
                          Редактировать
                        </Button>
                        <a href={`/blog/${post.slug}`} className="text-sm text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">
                          Открыть
                        </a>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleBlogDelete(post.id)}>
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </AdminGate>
  )
}
