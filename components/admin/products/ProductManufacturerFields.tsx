'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { AddProductFormValues, Language } from './productFormSchema';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ProductManufacturerFieldsProps {
    language: Language;
}

const ProductManufacturerFields: React.FC<ProductManufacturerFieldsProps> = ({ language }) => {
    const { register } = useFormContext<AddProductFormValues>();
    const { l } = useAdminLocale();

    return (
        <div className="add-product__section add-product__section--manufacturer">
            <h2 className="add-product__section-title">
                {l('Производитель и дистрибьютор', 'Manufacturer and distributor', 'Ražotājs un izplatītājs')}{' '}
                <span className="text-destructive">{l('(обязательно)', '(required)', '(obligāti)')}</span>
            </h2>
            <div className="add-product__fields-grid">
                <div>
                    <label htmlFor="manufacturer-name" className="block text-sm font-medium mb-1">{l('Производитель — название', 'Manufacturer — name', 'Ražotājs — nosaukums')}</label>
                    <Input id="manufacturer-name" placeholder={l('Название производителя', 'Manufacturer name', 'Ražotāja nosaukums')} {...register('manufacturerName')} />
                </div>
                <div>
                    <label htmlFor="manufacturer-address" className="block text-sm font-medium mb-1">{l('Производитель — адрес', 'Manufacturer — address', 'Ražotājs — adrese')}</label>
                    <Input id="manufacturer-address" placeholder={l('Адрес производителя', 'Manufacturer address', 'Ražotāja adrese')} {...register('manufacturerAddress')} />
                </div>
                <div>
                    <label htmlFor="manufacturer-email" className="block text-sm font-medium mb-1">{l('Производитель — email', 'Manufacturer — email', 'Ražotājs — e-pasts')}</label>
                    <Input id="manufacturer-email" placeholder="email@manufacturer.com" type="email" {...register('manufacturerEmail')} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">
                        {l('Дистрибьютор — название', 'Distributor — name', 'Izplatītājs — nosaukums')} ({language.toUpperCase()})
                    </label>
                    <Input
                        placeholder={l('Название дистрибьютора', 'Distributor name', 'Izplatītāja nosaukums')}
                        {...register(`distributorName.${language}` as 'distributorName.ru')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">
                        {l('Дистрибьютор — адрес', 'Distributor — address', 'Izplatītājs — adrese')} ({language.toUpperCase()})
                    </label>
                    <Input
                        placeholder={l('Адрес дистрибьютора', 'Distributor address', 'Izplatītāja adrese')}
                        {...register(`distributorAddress.${language}` as 'distributorAddress.ru')}
                    />
                </div>
                <div>
                    <label htmlFor="distributor-email" className="block text-sm font-medium mb-1">{l('Дистрибьютор — email', 'Distributor — email', 'Izplatītājs — e-pasts')}</label>
                    <Input id="distributor-email" placeholder="email@distributor.com" type="email" {...register('distributorEmail')} />
                </div>
            </div>
        </div>
    );
};

export default ProductManufacturerFields;
