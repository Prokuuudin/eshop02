'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PRODUCTS } from '@/data/products';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro } from '@/lib/utils';

export default function NotFoundContent() {
    const { t, language } = useTranslation();
    const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';
    const suggestedProducts = PRODUCTS.slice(0, 4);

    return (
        <main className="w-full px-4 py-20">
            <div className="max-w-2xl mx-auto text-center mb-16">
                {/* 404 Graphic */}
                <div className="not-found__code bem-not-found__code text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-pink-600 mb-4">
                    {t('notFound.code', '404')}
                </div>
                <h1 className="not-found__title bem-not-found__title text-4xl font-bold mb-4">
                    {t('notFound.title', 'Страница не найдена')}
                </h1>
                <p className="not-found__desc bem-not-found__desc text-xl text-gray-600 mb-8">
                    {t(
                        'notFound.description',
                        'Похоже, вы попали на несуществующую страницу. Возможно, она была удалена или адрес введён неправильно.'
                    )}
                </p>
                <div className="not-found__actions bem-not-found__actions flex flex-col sm:flex-row gap-3 justify-center mb-12">
                    <Link href="/">
                        <Button size="lg">
                            {t('notFound.icon.home', '🏠')} {t('notFound.home', 'На главную')}
                        </Button>
                    </Link>
                    <Link href="/catalog">
                        <Button variant="outline" size="lg">
                            {t('notFound.icon.catalog', '🛍️')} {t('notFound.catalog', 'В каталог')}
                        </Button>
                    </Link>
                    <Link href="/contact">
                        <Button variant="secondary" size="lg">
                            {t('notFound.contact', 'Связаться с нами')}
                        </Button>
                    </Link>
                </div>
                {/* ...удалён блок "Нужна помощь?"... */}
            </div>
            {/* Suggested Products */}
            <div className="not-found__suggested bem-not-found__suggested mb-16">
                <h2 className="not-found__suggested-title bem-not-found__suggested-title text-2xl font-bold mb-8 text-center">
                    {t('notFound.suggested', 'Может, вас заинтересует?')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {suggestedProducts.map((product) => (
                        <Link key={product.id} href={`/product/${product.id}`} className="group">
                            <div className="bg-white rounded-lg border p-4 hover:shadow-lg transition">
                                <div className="aspect-square bg-gray-100 rounded mb-3 overflow-hidden relative">
                                    <Image
                                        src={product.image || '/placeholder.png'}
                                        alt={product.title}
                                        fill
                                        className="object-cover group-hover:scale-105 transition"
                                    />
                                </div>
                                <h3 className="font-semibold text-sm group-hover:text-indigo-600 line-clamp-2">
                                    {t(`products.${product.id}.title`, product.title)}
                                </h3>
                                <p className="text-xs text-gray-600 mt-1">
                                    {t(`brands.${product.brand}`, product.brand)}
                                </p>
                                <div className="flex justify-between items-center mt-2">
                                    <span className="text-indigo-600 font-bold">
                                        {formatEuro(product.price, locale)}
                                    </span>
                                    <span className="text-xs text-yellow-500">
                                        ★ {t('notFound.rating', 'Rating')}{' '}
                                        {product.rating.toFixed(1)}
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            {/* ...удалён блок быстрых ссылок... */}
        </main>
    );
}
