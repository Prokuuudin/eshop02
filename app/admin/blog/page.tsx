'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  translations?: Partial<Record<'en' | 'lv', {
    title?: string
    excerpt?: string
    author?: string
    category?: string
    content?: string
    contentBlocks?: unknown[]
  }>>
}

type TranslationForm = {
  title: string
  excerpt: string
  author: string
  category: string
  content: string
  contentBlocksJson: string
}

const EMPTY_TRANSLATION: TranslationForm = {
  title: '',
  excerpt: '',
  author: '',
  category: '',
  content: '',
  contentBlocksJson: ''
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
  translations: { en: TranslationForm; lv: TranslationForm }
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
  contentBlocksJson: '[]',
  translations: { en: { ...EMPTY_TRANSLATION }, lv: { ...EMPTY_TRANSLATION } }
}

export default function AdminBlogPage() {
  const router = useRouter()
  const { language, t } = useTranslation()
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)
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
      setBlogError(tl('admin.blog.msg.loadFailed', 'Не удалось загрузить статьи блога', 'Failed to load blog posts', 'Neizdevas ieladet bloga rakstus'))
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
          setBlogError(tl('admin.blog.msg.invalidJsonWithReason', 'Невалидный JSON: {reason}', 'Invalid JSON: {reason}', 'Nederigs JSON: {reason}', { reason: parseError.message }))
          return
        }
        setBlogError(tl('admin.blog.msg.invalidJson', 'Невалидный JSON в contentBlocks', 'Invalid JSON in contentBlocks', 'Nederigs JSON lauka contentBlocks'))
        return
      }

      if (!Array.isArray(contentBlocks)) {
        setBlogError(tl('admin.blog.msg.contentBlocksArray', 'contentBlocks JSON должен быть массивом блоков', 'contentBlocks JSON must be an array of blocks', 'contentBlocks JSON jabut bloku masivam'))
        return
      }

      const translationsPayload: Partial<Record<'en' | 'lv', Record<string, unknown>>> = {}
      for (const lang of ['en', 'lv'] as const) {
        const tr = blogForm.translations[lang]
        const hasAnyText = tr.title || tr.excerpt || tr.author || tr.category || tr.content
        let trContentBlocks: unknown[] | undefined

        if (tr.contentBlocksJson.trim()) {
          let parsedTr: unknown
          try {
            parsedTr = JSON.parse(tr.contentBlocksJson)
          } catch (parseError) {
            setBlogError(`Невалидный JSON (${lang} contentBlocks): ${parseError instanceof Error ? parseError.message : ''}`)
            return
          }
          if (!Array.isArray(parsedTr)) {
            setBlogError(`${lang} contentBlocks JSON должен быть массивом блоков`)
            return
          }
          if (parsedTr.length > 0) trContentBlocks = parsedTr
        }

        if (hasAnyText || trContentBlocks) {
          translationsPayload[lang] = {
            ...(tr.title ? { title: tr.title } : {}),
            ...(tr.excerpt ? { excerpt: tr.excerpt } : {}),
            ...(tr.author ? { author: tr.author } : {}),
            ...(tr.category ? { category: tr.category } : {}),
            ...(tr.content ? { content: tr.content } : {}),
            ...(trContentBlocks ? { contentBlocks: trContentBlocks } : {})
          }
        }
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
        contentBlocks,
        translations: Object.keys(translationsPayload).length > 0 ? translationsPayload : undefined
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

      setBlogMessage(
        editingBlogId
          ? tl('admin.blog.msg.updated', 'Статья обновлена', 'Post updated', 'Raksts atjauninats')
          : tl('admin.blog.msg.saved', 'Статья сохранена', 'Post saved', 'Raksts saglabats')
      )
      setBlogForm(INITIAL_BLOG_FORM)
      setEditingBlogId(null)
      await loadBlogPosts()
    } catch (saveError) {
      const reason = saveError instanceof Error
        ? saveError.message
        : tl('admin.blog.msg.saveFailed', 'Ошибка сохранения', 'Save failed', 'Saglabasana neizdevas')
      setBlogError(tl('admin.blog.msg.saveFailedWithReason', 'Ошибка сохранения: {reason}', 'Save error: {reason}', 'Saglabasanas kluda: {reason}', { reason }))
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

      setBlogMessage(tl('admin.blog.msg.deleted', 'Статья удалена', 'Post deleted', 'Raksts dzests'))
      if (editingBlogId === id) {
        setEditingBlogId(null)
        setBlogForm(INITIAL_BLOG_FORM)
      }
      await loadBlogPosts()
    } catch {
      setBlogError(tl('admin.blog.msg.deleteFailed', 'Не удалось удалить статью', 'Failed to delete post', 'Neizdevas dzest rakstu'))
    }
  }

  const handleStartEditBlog = (post: AdminBlogPost): void => {
    setEditingBlogId(post.id)
    setBlogMessage('')
    setBlogError('')

    const getTranslationForm = (lang: 'en' | 'lv'): TranslationForm => {
      const tr = post.translations?.[lang]
      if (!tr) return { ...EMPTY_TRANSLATION }
      return {
        title: tr.title ?? '',
        excerpt: tr.excerpt ?? '',
        author: tr.author ?? '',
        category: tr.category ?? '',
        content: tr.content ?? '',
        contentBlocksJson: Array.isArray(tr.contentBlocks) && tr.contentBlocks.length > 0
          ? JSON.stringify(tr.contentBlocks, null, 2)
          : ''
      }
    }

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
      contentBlocksJson: JSON.stringify(post.contentBlocks ?? [], null, 2),
      translations: { en: getTranslationForm('en'), lv: getTranslationForm('lv') }
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
      <main className="w-full py-4 text-gray-900 dark:text-gray-100">
<div className="flex flex-wrap justify-between items-center gap-3 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{tl('admin.blog.title', 'Управление блогом', 'Blog management', 'Bloga parvaldiba')}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{tl('admin.blog.subtitle', 'Создание, редактирование и удаление статей', 'Create, edit, and delete posts', 'Rakstu izveide, redigesana un dzesana')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin">
                <Button variant="outline">{tl('admin.blog.backToAdmin', 'Назад в админ-панель', 'Back to admin panel', 'Atpakal uz admin paneli')}</Button>
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
              <Tabs defaultValue="base">
                <TabsList className="mb-4">
                  <TabsTrigger value="base">Основное (RU)</TabsTrigger>
                  <TabsTrigger value="en">English</TabsTrigger>
                  <TabsTrigger value="lv">Latviešu</TabsTrigger>
                </TabsList>

                <TabsContent value="base">
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
                        placeholder="# Заголовок&#10;&#10;Текст..."
                      />
                    </label>

                    <label className="text-sm md:col-span-2">
                      <span className="block text-gray-600 dark:text-gray-300 mb-1">
                        contentBlocks JSON
                        <span className="ml-2 text-xs text-gray-400">heading·paragraph·list(ordered?)·quote(author?)·image(src,alt,caption?)·gallery</span>
                      </span>
                      <textarea
                        value={blogForm.contentBlocksJson}
                        onChange={(e) => setBlogForm((prev) => ({ ...prev, contentBlocksJson: e.target.value }))}
                        className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 min-h-[220px] font-mono text-xs"
                        placeholder='[{"type":"paragraph","text":"..."}]'
                        required
                      />
                    </label>
                  </div>
                </TabsContent>

                {(['en', 'lv'] as const).map((lang) => (
                  <TabsContent key={lang} value={lang}>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                      Пустые поля наследуют значение из основной (RU) вкладки. Заполните только те поля, которые отличаются.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="text-sm md:col-span-2">
                        <span className="block text-gray-600 dark:text-gray-300 mb-1">Заголовок ({lang})</span>
                        <input
                          value={blogForm.translations[lang].title}
                          onChange={(e) => setBlogForm((prev) => ({ ...prev, translations: { ...prev.translations, [lang]: { ...prev.translations[lang], title: e.target.value } } }))}
                          className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                          placeholder={blogForm.title || `Заголовок на ${lang}`}
                        />
                      </label>

                      <label className="text-sm md:col-span-2">
                        <span className="block text-gray-600 dark:text-gray-300 mb-1">Краткое описание ({lang})</span>
                        <textarea
                          value={blogForm.translations[lang].excerpt}
                          onChange={(e) => setBlogForm((prev) => ({ ...prev, translations: { ...prev.translations, [lang]: { ...prev.translations[lang], excerpt: e.target.value } } }))}
                          className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 min-h-[72px]"
                          placeholder={blogForm.excerpt || `Описание на ${lang}`}
                        />
                      </label>

                      <label className="text-sm">
                        <span className="block text-gray-600 dark:text-gray-300 mb-1">Автор ({lang})</span>
                        <input
                          value={blogForm.translations[lang].author}
                          onChange={(e) => setBlogForm((prev) => ({ ...prev, translations: { ...prev.translations, [lang]: { ...prev.translations[lang], author: e.target.value } } }))}
                          className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                          placeholder={blogForm.author || `Author (${lang})`}
                        />
                      </label>

                      <label className="text-sm">
                        <span className="block text-gray-600 dark:text-gray-300 mb-1">Категория ({lang})</span>
                        <input
                          value={blogForm.translations[lang].category}
                          onChange={(e) => setBlogForm((prev) => ({ ...prev, translations: { ...prev.translations, [lang]: { ...prev.translations[lang], category: e.target.value } } }))}
                          className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                          placeholder={blogForm.category || `Category (${lang})`}
                        />
                      </label>

                      <label className="text-sm md:col-span-2">
                        <span className="block text-gray-600 dark:text-gray-300 mb-1">Legacy content ({lang}, опционально)</span>
                        <textarea
                          value={blogForm.translations[lang].content}
                          onChange={(e) => setBlogForm((prev) => ({ ...prev, translations: { ...prev.translations, [lang]: { ...prev.translations[lang], content: e.target.value } } }))}
                          className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 min-h-[120px]"
                          placeholder="# Heading&#10;&#10;Text..."
                        />
                      </label>

                      <label className="text-sm md:col-span-2">
                        <span className="block text-gray-600 dark:text-gray-300 mb-1">
                          contentBlocks JSON ({lang}, опционально)
                          <span className="ml-2 text-xs text-gray-400">heading·paragraph·list(ordered?)·quote(author?)·image(src,alt,caption?)·gallery</span>
                        </span>
                        <textarea
                          value={blogForm.translations[lang].contentBlocksJson}
                          onChange={(e) => setBlogForm((prev) => ({ ...prev, translations: { ...prev.translations, [lang]: { ...prev.translations[lang], contentBlocksJson: e.target.value } } }))}
                          className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 min-h-[220px] font-mono text-xs"
                          placeholder='[{"type":"paragraph","text":"..."}]'
                        />
                      </label>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={blogForm.featured}
                  onChange={(e) => setBlogForm((prev) => ({ ...prev, featured: e.target.checked }))}
                />
                {tl('admin.blog.featuredToggle', 'Показать как featured', 'Mark as featured', 'Atzimet ka izceltu')}
              </label>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={blogSaving}>
                  {blogSaving
                    ? tl('admin.blog.saving', 'Сохранение...', 'Saving...', 'Saglabasana...')
                    : (editingBlogId
                      ? tl('admin.blog.updatePost', 'Обновить статью', 'Update post', 'Atjaunot rakstu')
                      : tl('admin.blog.savePost', 'Сохранить статью', 'Save post', 'Saglabat rakstu'))}
                </Button>
                {editingBlogId && (
                  <Button type="button" variant="outline" onClick={handleCancelBlogEdit}>{tl('admin.blog.cancelEdit', 'Отменить редактирование', 'Cancel editing', 'Atcelt redigesanu')}</Button>
                )}
                {blogMessage && <span className="text-sm text-green-700">{blogMessage}</span>}
                {blogError && <span className="text-sm text-red-600">{blogError}</span>}
              </div>
            </form>

            <div>
              <h3 className="text-lg font-semibold mb-3">{tl('admin.blog.postsList', 'Список статей', 'Posts list', 'Rakstu saraksts')}</h3>
              {blogLoading ? (
                <p className="text-gray-600 dark:text-gray-300">{tl('admin.blog.loading', 'Загрузка...', 'Loading...', 'Ielade...')}</p>
              ) : blogPosts.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-300">{tl('admin.blog.empty', 'Статей пока нет', 'No posts yet', 'Rakstu vel nav')}</p>
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
                          {tl('admin.blog.edit', 'Редактировать', 'Edit', 'Rediget')}
                        </Button>
                        <a href={`/blog/${post.slug}`} className="text-sm text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">
                          {tl('admin.blog.open', 'Открыть', 'Open', 'Atvert')}
                        </a>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleBlogDelete(post.id)}>
                          {tl('admin.blog.delete', 'Удалить', 'Delete', 'Dzest')}
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
  )
}
