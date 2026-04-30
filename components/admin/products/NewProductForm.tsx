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
            <AccordionItem value="add-product">
                <AccordionTrigger className="group text-xl font-bold !p-0 !bg-transparent !border-0 !no-underline focus:!no-underline">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 transition hover:bg-primary/10 cursor-pointer select-none">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary">
                            <IconPlus className="w-6 h-6" />
                        </span>
                        <span className="text-base font-semibold">
                            {title || t('admin.productsPage.addBtn') || 'Добавить товар'}
                        </span>
                        <ChevronDown className="h-5 w-5 text-primary transition-transform duration-200 group-data-[state=open]:rotate-180 ml-auto" />
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <AddProductForm />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};

export default NewProductForm;
