const BLOG_CATEGORY_KEYS = [
  'blog.category.faceCare',
  'blog.category.hairCare',
  'blog.category.bodyCare',
  'blog.category.makeup',
  'blog.category.ingredients'
] as const

const BLOG_CATEGORY_TO_CATALOG: Record<string, string> = {
  'blog.category.faceCare': 'face',
  'blog.category.hairCare': 'hair',
  'blog.category.bodyCare': 'body',
  'blog.category.makeup': 'face',
  'blog.category.ingredients': 'face'
}

type Translate = (key: string, defaultValue?: string) => string

const normalize = (value: string): string => value.trim().toLowerCase()

export const resolveBlogCategoryKey = (
  category: string,
  t: Translate
): string | null => {
  if (!category) {
    return null
  }

  if (category.startsWith('blog.category.')) {
    return category
  }

  const normalizedCategory = normalize(category)

  for (const key of BLOG_CATEGORY_KEYS) {
    const translatedCategory = normalize(t(key, key))
    if (translatedCategory === normalizedCategory) {
      return key
    }
  }

  return null
}

export const resolveCatalogCategoryFromBlogCategory = (
  category: string,
  t: Translate
): string => {
  const categoryKey = resolveBlogCategoryKey(category, t)
  if (!categoryKey) {
    return ''
  }

  return BLOG_CATEGORY_TO_CATALOG[categoryKey] ?? ''
}
