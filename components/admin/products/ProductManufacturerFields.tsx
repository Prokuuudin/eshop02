'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { AddProductFormValues, Language } from './productFormSchema';

interface ProductManufacturerFieldsProps {
    language: Language;
}

const ProductManufacturerFields: React.FC<ProductManufacturerFieldsProps> = ({ language }) => {
    const { register } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--manufacturer">
            <h2 className="add-product__section-title">Производитель и дистрибьютор</h2>
            <p className="text-xs text-muted-foreground mb-2">
                Необязательно: если оставить пустым, на странице товара показываются данные бренда
                из конфигурации брендов; заполненные здесь поля их переопределяют.
            </p>
            <div className="add-product__fields-grid">
                <div>
                    <label htmlFor="manufacturer-name" className="block text-sm font-medium mb-1">Производитель — название</label>
                    <Input id="manufacturer-name" placeholder="Название производителя" {...register('manufacturerName')} />
                </div>
                <div>
                    <label htmlFor="manufacturer-address" className="block text-sm font-medium mb-1">Производитель — адрес</label>
                    <Input id="manufacturer-address" placeholder="Адрес производителя" {...register('manufacturerAddress')} />
                </div>
                <div>
                    <label htmlFor="manufacturer-email" className="block text-sm font-medium mb-1">Производитель — email</label>
                    <Input id="manufacturer-email" placeholder="email@manufacturer.com" type="email" {...register('manufacturerEmail')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Дистрибьютор — название ({language.toUpperCase()})
                    </label>
                    <Input
                        placeholder="Название дистрибьютора"
                        {...register(`distributorName.${language}` as 'distributorName.ru')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Дистрибьютор — адрес ({language.toUpperCase()})
                    </label>
                    <Input
                        placeholder="Адрес дистрибьютора"
                        {...register(`distributorAddress.${language}` as 'distributorAddress.ru')}
                    />
                </div>
                <div>
                    <label htmlFor="distributor-email" className="block text-sm font-medium mb-1">Дистрибьютор — email</label>
                    <Input id="distributor-email" placeholder="email@distributor.com" type="email" {...register('distributorEmail')} />
                </div>
            </div>
        </div>
    );
};

export default ProductManufacturerFields;
