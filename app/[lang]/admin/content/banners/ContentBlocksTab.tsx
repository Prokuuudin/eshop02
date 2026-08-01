'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { encodeLocaleText, resolveLocaleText } from '@/lib/locale-text'
import { LocaleTextField } from './LocaleTextField'
import { BLOCK_TYPE_LABELS, type BlockType } from './banner-model'
import type { useBannerContentManager } from './useBannerContentManager'

type BannerContentState = ReturnType<typeof useBannerContentManager>

export default function ContentBlocksTab({ state }: { state: BannerContentState }): React.ReactElement {
  const { banners, blocks, loading, saving, message, bannerForm, setBannerForm, editingBannerId, showBannerForm, setShowBannerForm, blockForm, setBlockForm, editingBlockId, showBlockForm, setShowBlockForm, uploadingBannerImage, onBannerImageUpload, onSaveBanner, onDeleteBanner, onToggleBanner, onMoveBanner, onEditBanner, resetBannerForm, onSaveBlock, onDeleteBlock, onToggleBlock, onMoveBlock, onEditBlock, resetBlockForm } = state
  return (
<TabsContent value="blocks" className="space-y-4 mt-4">
              <div className="flex justify-end">
                <Button onClick={() => { resetBlockForm(); setShowBlockForm(true) }} disabled={saving}>
                  + Добавить блок
                </Button>
              </div>

              {/* Block form */}
              {showBlockForm && (
                <div className="rounded-lg border border-primary/30 dark:border-primary/50 bg-card p-5 space-y-4">
                  <h2 className="text-base font-semibold text-foreground">
                    {editingBlockId ? 'Редактировать блок' : 'Новый контентный блок'}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="admin-banner-field-9" className="text-xs text-muted-foreground">Тип блока</label>
                      <Select
                        value={blockForm.type}
                        onValueChange={(v) => setBlockForm((f) => ({ ...f, type: v as BlockType }))}
                      >
                        <SelectTrigger id="admin-banner-field-9" className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
                            <SelectItem key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="admin-banner-field-10" className="text-xs text-muted-foreground">Заголовок *</label>
                      <Input id="admin-banner-field-10"
                        value={blockForm.title}
                        onChange={(e) => setBlockForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Заголовок блока"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label htmlFor="admin-banner-field-11" className="text-xs text-muted-foreground">Подзаголовок</label>
                      <Input id="admin-banner-field-11"
                        value={blockForm.subtitle}
                        onChange={(e) => setBlockForm((f) => ({ ...f, subtitle: e.target.value }))}
                        placeholder="Краткое описание"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label htmlFor="admin-banner-field-12" className="text-xs text-muted-foreground">Текст / HTML-контент</label>
                      <Textarea id="admin-banner-field-12"
                        value={blockForm.content}
                        onChange={(e) => setBlockForm((f) => ({ ...f, content: e.target.value }))}
                        placeholder="Основной текст блока..."
                        className="min-h-[100px]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="admin-banner-field-13" className="text-xs text-muted-foreground">Иконка (emoji или путь)</label>
                      <Input id="admin-banner-field-13"
                        value={blockForm.icon}
                        onChange={(e) => setBlockForm((f) => ({ ...f, icon: e.target.value }))}
                        placeholder="✨ или /icons/star.svg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="admin-banner-field-14" className="text-xs text-muted-foreground">Цвет фона</label>
                      <div className="flex items-center gap-2">
                        <input id="admin-banner-field-14"
                          type="color"
                          value={blockForm.bgColor}
                          onChange={(e) => setBlockForm((f) => ({ ...f, bgColor: e.target.value }))}
                          className="h-9 w-14 rounded border border-border cursor-pointer"
                        />
                        <Input
                          value={blockForm.bgColor}
                          onChange={(e) => setBlockForm((f) => ({ ...f, bgColor: e.target.value }))}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="admin-banner-field-15" className="text-xs text-muted-foreground">Ссылка (href)</label>
                      <Input id="admin-banner-field-15"
                        value={blockForm.link}
                        onChange={(e) => setBlockForm((f) => ({ ...f, link: e.target.value }))}
                        placeholder="/catalog"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="admin-banner-field-16" className="text-xs text-muted-foreground">Текст ссылки</label>
                      <Input id="admin-banner-field-16"
                        value={blockForm.linkLabel}
                        onChange={(e) => setBlockForm((f) => ({ ...f, linkLabel: e.target.value }))}
                        placeholder="Подробнее"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="admin-banner-field-17" className="text-xs text-muted-foreground">Активен</label>
                      <Select
                        value={blockForm.active ? 'yes' : 'no'}
                        onValueChange={(v) => setBlockForm((f) => ({ ...f, active: v === 'yes' }))}
                      >
                        <SelectTrigger id="admin-banner-field-17" className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Да — отображается на сайте</SelectItem>
                          <SelectItem value="no">Нет — скрыт</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={onSaveBlock} disabled={saving}>
                      {editingBlockId ? 'Сохранить изменения' : 'Создать блок'}
                    </Button>
                    <Button variant="outline" onClick={resetBlockForm} disabled={saving}>
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              {/* Blocks list */}
              {blocks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Блоков пока нет. Нажмите «+ Добавить блок», чтобы создать первый.
                </div>
              ) : (
                <div className="space-y-3">
                  {blocks.map((block, idx) => (
                    <div
                      key={block.id}
                      className={`rounded-lg border bg-card p-4 flex gap-3 items-start transition-opacity ${
                        block.active
                          ? 'border-border'
                          : 'border-border opacity-50'
                      }`}
                    >
                      {/* Color swatch + icon */}
                      <div
                        className="h-12 w-12 rounded flex-shrink-0 flex items-center justify-center text-xl border border-border"
                        style={{ backgroundColor: block.bgColor }}
                      >
                        {block.icon || '▪'}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {block.title}
                          </span>
                          <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                            {BLOCK_TYPE_LABELS[block.type]}
                          </span>
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                            block.active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-muted text-gray-500'
                          }`}>
                            {block.active ? 'Активен' : 'Скрыт'}
                          </span>
                        </div>
                        {block.subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{block.subtitle}</p>
                        )}
                        {block.content && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{block.content}</p>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="outline" size="sm"
                          disabled={idx === 0 || saving}
                          onClick={() => void onMoveBlock(block.id, 'up')}
                          title="Выше"
                        >▲</Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={idx === blocks.length - 1 || saving}
                          onClick={() => void onMoveBlock(block.id, 'down')}
                          title="Ниже"
                        >▼</Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={saving}
                          onClick={() => void onToggleBlock(block)}
                        >
                          {block.active ? 'Скрыть' : 'Показать'}
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={saving}
                          onClick={() => onEditBlock(block)}
                        >
                          Изменить
                        </Button>
                        <Button
                          variant="destructive" size="sm"
                          disabled={saving}
                          onClick={() => void onDeleteBlock(block.id)}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
  )
}
