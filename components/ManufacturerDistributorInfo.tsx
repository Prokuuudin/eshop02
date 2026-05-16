import React from 'react';
import { Product } from '@/data/products';
import { BRANDS } from '@/data/brands';
import { useTranslation } from '@/lib/use-translation';

// Простая функция транслитерации кириллицы в латиницу
function transliterate(str: string): string {
    const map: Record<string, string> = {
        А: 'A',
        а: 'a',
        Б: 'B',
        б: 'b',
        В: 'V',
        в: 'v',
        Г: 'G',
        г: 'g',
        Д: 'D',
        д: 'd',
        Е: 'E',
        е: 'e',
        Ё: 'E',
        ё: 'e',
        Ж: 'Zh',
        ж: 'zh',
        З: 'Z',
        з: 'z',
        И: 'I',
        и: 'i',
        Й: 'Y',
        й: 'y',
        К: 'K',
        к: 'k',
        Л: 'L',
        л: 'l',
        М: 'M',
        м: 'm',
        Н: 'N',
        н: 'n',
        О: 'O',
        о: 'o',
        П: 'P',
        п: 'p',
        Р: 'R',
        р: 'r',
        С: 'S',
        с: 's',
        Т: 'T',
        т: 't',
        У: 'U',
        у: 'u',
        Ф: 'F',
        ф: 'f',
        Х: 'Kh',
        х: 'kh',
        Ц: 'Ts',
        ц: 'ts',
        Ч: 'Ch',
        ч: 'ch',
        Ш: 'Sh',
        ш: 'sh',
        Щ: 'Shch',
        щ: 'shch',
        Ы: 'Y',
        ы: 'y',
        Э: 'E',
        э: 'e',
        Ю: 'Yu',
        ю: 'yu',
        Я: 'Ya',
        я: 'ya',
        Ь: '',
        ь: '',
        Ъ: '',
        ъ: '',
    };
    return str
        .split('')
        .map((char) => map[char] ?? char)
        .join('');
}

export const ManufacturerDistributorInfo: React.FC<{
    product: Product;
    brandId: string;
    language: string;
}> = ({ product, brandId, language }) => {
    const { t } = useTranslation();
    const brand = BRANDS.find((b) => b.id === brandId);
    let brandDescription = '';
    if (brand && typeof brand.description === 'object') {
        brandDescription = brand.description[language as 'ru' | 'en' | 'lv'] || '';
    } else if (brand && typeof brand.description === 'string') {
        brandDescription = brand.description;
    }
    const fullName = brandDescription || '—';
    const address = '—';
    const email = '—';
    // Мультиязычный адрес дистрибьютора
    let distributorAddress = 'ул. Ренцену, 10A, Рига';
    if (language === 'en') {
        distributorAddress = '10A, Rencenu St., Riga';
    } else if (language === 'lv') {
        distributorAddress = 'Rencēnu iela 10A, Rīga';
    }
    // Имя дистрибьютора с учётом языка
    let distributorName = 'MIKS PLUS SIA';
    if (language === 'ru') {
        distributorName = 'ООО "MIKS PLUS"';
    } else if (language === 'en') {
        distributorName = 'MIKS PLUS LLC';
    }
    return (
        <div className="product-detail__manufacturer-distributor mt-2 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700 text-sm">
            <div className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
                {t('manufacturer.title')}
            </div>
            <ul className="mb-4 list-disc pl-5">
                <li>
                    {t('manufacturer.fullName')} {fullName}
                </li>
                <li>
                    {t('manufacturer.address')} {address}
                </li>
                <li>
                    {t('manufacturer.email')}{' '}
                    {email !== '—' ? (
                        <a href={`mailto:${email}`} className="text-blue-700 underline">
                            {email}
                        </a>
                    ) : (
                        '—'
                    )}
                </li>
            </ul>
            <div className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
                {t('distributor.title')}
            </div>
            <ul className="list-disc pl-5">
                <li>
                    {t('distributor.name')} {distributorName}
                </li>
                <li>
                    {t('distributor.address')} {distributorAddress}
                </li>
                <li>
                    {t('distributor.email')}{' '}
                    <a href="mailto:office@miksplus.eu" className="text-blue-700 underline">
                        office@miksplus.eu
                    </a>
                </li>
            </ul>
        </div>
    );
};
