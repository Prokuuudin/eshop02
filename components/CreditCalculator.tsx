import React from 'react';
import { useTranslation } from '@/lib/use-translation';

interface CreditCalculatorProps {
    price: number;
}

export const CreditCalculator: React.FC<CreditCalculatorProps> = ({ price }) => {
    const { t } = useTranslation();
    const [downPaymentPercent, setDownPaymentPercent] = React.useState(0);
    const [creditTerm, setCreditTerm] = React.useState(12);
    const downPaymentEur = (price * downPaymentPercent) / 100;
    const creditAmount = price - downPaymentEur;
    const monthlyPayment = creditTerm > 0 ? creditAmount / creditTerm : 0;

    return (
        <div className="product-detail__credit-calculator mt-4 p-4 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
            <h3 className="text-lg font-semibold mb-4">{t('credit.calculatorTitle')}</h3>
            <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1 min-w-[160px]">
                    <label
                        htmlFor="downPaymentPercent"
                        className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1"
                    >
                        {t('credit.downPaymentPercent')}
                    </label>
                    <input
                        id="downPaymentPercent"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={downPaymentPercent}
                        onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
                        className="shadcn-input w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                    />
                </div>
                <div className="flex flex-col gap-1 min-w-[160px]">
                    <label
                        htmlFor="creditTerm"
                        className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1"
                    >
                        {t('credit.termMonths')}
                    </label>
                    <input
                        id="creditTerm"
                        type="number"
                        min={1}
                        max={60}
                        step={1}
                        value={creditTerm}
                        onChange={(e) => setCreditTerm(Number(e.target.value))}
                        className="shadcn-input w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                    />
                </div>
            </div>
            <div className="flex flex-wrap gap-6 mt-4">
                <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                    {t('credit.downPaymentEur').replace('{amount}', downPaymentEur.toFixed(2))}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                    {t('credit.monthlyPayment').replace('{amount}', monthlyPayment.toFixed(2))}
                </div>
            </div>
        </div>
    );
};
