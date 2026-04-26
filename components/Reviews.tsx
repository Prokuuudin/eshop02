"use client";
import React, { useEffect, useState } from "react";
import { useTranslation } from "@/lib/use-translation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RatingDisplay from "./RatingDisplay";
import { formatDate, getLocaleFromLanguage } from "@/lib/utils";

type ReviewsProps = {
  productId: string;
};

type ReviewItem = {
  id: string;
  productId: string;
  author: string;
  rating: number;
  title: string;
  text: string;
  createdAt: string;
  helpful: number;
};

type ReviewStats = {
  averageRating: number;
  count: number;
  distribution: Record<number, number>;
};

export default function Reviews({ productId }: ReviewsProps) {
  const { t, language } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ author: "", rating: 5, title: "", text: "" });
  const [submitted, setSubmitted] = useState(false);
  const [productReviews, setProductReviews] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats>({
    averageRating: 0,
    count: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  });

  const loadReviews = async (): Promise<void> => {
    try {
      const response = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('failed-to-load-reviews');

      const payload = (await response.json()) as {
        data?: {
          reviews?: ReviewItem[];
          stats?: ReviewStats;
        };
      };

      setProductReviews(payload.data?.reviews ?? []);
      setStats(payload.data?.stats ?? { averageRating: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    } catch {
      setProductReviews([]);
      setStats({ averageRating: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    }
  };

  useEffect(() => {
    void loadReviews();
  }, [productId]);

  const getBasedOnLabel = (count: number): string => {
    if (language === 'ru') {
      const key = count % 10 === 1 && count % 100 !== 11 ? 'reviews.basedOnOne' : 'reviews.basedOnMany'
      return t(key, 'На основе {count} отзывов', { count })
    }

    if (language === 'lv') {
      const key = count === 1 ? 'reviews.basedOnOne' : 'reviews.basedOnMany'
      return t(key, 'Pamatojoties uz {count} atsauksmēm', { count })
    }

    const key = count === 1 ? 'reviews.basedOnOne' : 'reviews.basedOnMany'
    return t(key, 'Based on {count} reviews', { count })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void (async () => {
      try {
        const response = await fetch('/api/reviews', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            productId,
            author: formData.author.trim() || 'Аноним',
            rating: formData.rating,
            title: formData.title.trim(),
            text: formData.text.trim()
          })
        });

        if (!response.ok) throw new Error('failed-to-submit-review');

        setSubmitted(true);
        setFormData({ author: "", rating: 5, title: "", text: "" });
        await loadReviews();
        setTimeout(() => {
          setShowForm(false);
          setSubmitted(false);
        }, 2000);
      } catch {
        setSubmitted(false);
      }
    })();
  };

  const handleHelpful = async (reviewId: string): Promise<void> => {
    try {
      const response = await fetch('/api/reviews/helpful', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: reviewId })
      });

      if (!response.ok) throw new Error('failed-to-mark-helpful');
      await loadReviews();
    } catch {
      // Ignore client errors in the helpful interaction.
    }
  };

  return (
    <section className="mt-12 border-t border-gray-200 dark:border-gray-800 pt-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">{t("reviews.title")} ({stats.count})</h2>
      {/* Статистика оценок */}
      {stats.count > 0 && (
        <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4 mb-4">
            <div>
              <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">{stats.averageRating}</div>
              <RatingDisplay rating={stats.averageRating} showLabel={false} />
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                {getBasedOnLabel(stats.count)}
              </p>
            </div>
            <div className="flex-1">
              {[5, 4, 3, 2, 1].map((rating) => (
                <div key={rating} className="flex items-center gap-2 text-sm mb-1 text-gray-800 dark:text-gray-200">
                  <span className="w-12">{rating} ★</span>
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded">
                    <div
                      className="h-full bg-yellow-400 rounded"
                      style={{ width: `${stats.count > 0 ? (stats.distribution[rating] / stats.count) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-right">{stats.distribution[rating] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Форма рецензии */}
      {!showForm ? (
        <Button onClick={() => setShowForm(true)} className="mb-6">
          {t("reviews.write")}
        </Button>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <h3 className="font-bold mb-4 text-gray-900 dark:text-gray-100">{t("reviews.your")}</h3>
          {submitted ? (
            <div className="text-center py-4 text-green-600">✓ {t("reviews.thankYou")}</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t("reviews.name")}</label>
                <Input
                  type="text"
                  name="author"
                  value={formData.author}
                  onChange={handleChange}
                  placeholder={t("reviews.namePlaceholder")}
                  className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t("reviews.rating")}</label>
                <Select
                  value={String(formData.rating)}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, rating: parseInt(value, 10) }))}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        {r} - {"★".repeat(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t("reviews.titleLabel")}</label>
                <Input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder={t("reviews.titlePlaceholder")}
                  className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t("reviews.textLabel")}</label>
                <Textarea
                  name="text"
                  value={formData.text}
                  onChange={handleChange}
                  placeholder={t("reviews.textPlaceholder")}
                  className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                  rows={4}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{t("reviews.send")}</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  {t("reviews.cancel")}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
      {/* Список рецензий */}
      <div className="space-y-4">
        {productReviews.length > 0 ? (
          productReviews.map((review) => (
            <div key={review.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-900">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <RatingDisplay rating={review.rating} showLabel={false} />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{review.title}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{review.author}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(review.createdAt, getLocaleFromLanguage(language))}</p>
              </div>
              <p className="text-gray-700 dark:text-gray-200 mb-3">{review.text}</p>
              <button
                onClick={() => void handleHelpful(review.id)}
                className="text-sm text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                👍 {t("reviews.helpful")} ({review.helpful})
              </button>
            </div>
          ))
        ) : (
          <p className="text-gray-600 dark:text-gray-300 text-center py-4">{t("reviews.empty")}</p>
        )}
      </div>
    </section>
  );
}

