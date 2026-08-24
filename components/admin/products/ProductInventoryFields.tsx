import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { AddProductFormValues } from './productFormSchema';
import { useAdminLocale } from '@/lib/use-admin-locale';

const ProductInventoryFields: React.FC = () => {
    const { l } = useAdminLocale();
    const { register } = useFormContext<AddProductFormValues>();

    return (
        <div className="add-product__section add-product__section--inventory">
            <h2 className="add-product__section-title">{l('Склад и наличие', 'Inventory and availability', 'Noliktava un pieejamība')}</h2>
            <div className="add-product__fields-grid">
                <div>
                    <label htmlFor="product-stock" className="block text-sm font-medium mb-1">{l('Остаток на складе', 'Stock quantity', 'Atlikums noliktavā')}</label>
                    <Input
                        id="product-stock"
                        placeholder={l('Количество штук', 'Number of units', 'Vienību skaits')}
                        type="number"
                        {...register('stock', { valueAsNumber: true })}
                    />
                </div>
                <div>
                    <label htmlFor="product-min-order" className="block text-sm font-medium mb-1">{l('Минимальный заказ', 'Minimum order', 'Minimālais pasūtījums')}</label>
                    <Input
                        id="product-min-order"
                        placeholder={l('Например: 1', 'For example: 1', 'Piemēram: 1')}
                        type="number"
                        {...register('minOrder', { valueAsNumber: true })}
                    />
                </div>
            </div>
        </div>
    );
};

export default ProductInventoryFields;
