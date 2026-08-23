import React from 'react';
import { useTranslation } from '@/lib/i18n-context';

import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import AddProductForm from './AddProductForm';
import IconPlus from '@/components/ui/icon-plus';
import { ChevronDown } from 'lucide-react';

interface NewProductFormProps {
    title?: string;
}

const NewProductForm: React.FC<NewProductFormProps> = ({ title }) => {
    const { t } = useTranslation();
    return (
        <Accordion type="single" collapsible className="admin-products__new-form">
            <AccordionItem
                value="add-product"
                className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/20"
            >
                <AccordionTrigger className="group text-xl font-bold !p-0 !bg-transparent !border-0 !no-underline focus:!no-underline [&>svg]:hidden">
                    <div className="flex w-full cursor-pointer select-none items-center gap-3 rounded-lg px-4 py-3.5 transition-colors hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                            <IconPlus className="w-6 h-6" />
                        </span>
                        <span className="text-base font-semibold">
                            {title || t('admin.productsPage.addBtn') || 'Добавить товар'}
                        </span>
                        <ChevronDown className="ml-auto h-5 w-5 text-emerald-700 transition-transform duration-200 group-data-[state=open]:rotate-180 dark:text-emerald-400" />
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-emerald-200 p-4 dark:border-emerald-800">
                    <AddProductForm />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

export default NewProductForm;
