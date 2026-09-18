'use client';

import React, { useState } from 'react';
import { Info, Loader2, MoreHorizontal } from 'lucide-react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import ProductPreviewCard from '@/components/admin/products/ProductPreviewCard';
import ProductCardSkeleton from '@/components/ProductCardSkeleton';
import AdminTableSkeleton from '@/components/admin/AdminTableSkeleton';
import StickyTableHead from '@/components/admin/StickyTableHead';
import BonusSection from '@/components/BonusSection';
import { Section } from './DesignSystemPrimitives';

export default function DesignSystemPatterns(): React.ReactElement {
    const { l } = useAdminLocale();
    const { showToast } = useToast();
    const [page, setPage] = useState(1);
    const [empty, setEmpty] = useState(false);
    const [notice, setNotice] = useState('');
    const item = l(
        'Демонстрационный товар',
        'Demo product',
        'Demonstrācijas prece'
    );
    return (
        <>
            <Section
                title={l(
                    '10 · Подсказки и выбор',
                    '10 · Hints and selection',
                    '10 · Padomi un izvēle'
                )}
            >
                <p className="text-sm text-muted-foreground">
                    {l(
                        'Tooltip / Hint — короткое пояснение при наведении или фокусе. Задержка 200 мс, отступ 6 px, ширина до 320 px. Важные инструкции показывайте рядом с полем; не прячьте их в подсказке.',
                        'Tooltip / Hint provides a short explanation on hover or focus. Delay: 200 ms; offset: 6 px; maximum width: 320 px. Keep essential instructions beside the field.',
                        'Tooltip / Hint sniedz īsu skaidrojumu, novietojot kursoru vai fokusējot. Aizture: 200 ms; atstarpe: 6 px; platums līdz 320 px. Svarīgās instrukcijas rādiet blakus laukam.'
                    )}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                    <Hint
                        content={l(
                            'Подсказки используют цвета текущей темы.',
                            'Hints use the current theme colors.',
                            'Padomi izmanto pašreizējās tēmas krāsas.'
                        )}
                    >
                        <Button variant="outline">
                            <Info aria-hidden="true" />
                            {l('Пояснение', 'Explanation', 'Skaidrojums')}
                        </Button>
                    </Hint>
                    <div className="w-full max-w-xs">
                        <label
                            htmlFor="ds-select"
                            className="mb-2 block text-sm font-medium"
                        >
                            {l('Наличие', 'Availability', 'Pieejamība')}
                        </label>
                        <Select defaultValue="all">
                            <SelectTrigger id="ds-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    {l(
                                        'Все товары',
                                        'All products',
                                        'Visas preces'
                                    )}
                                </SelectItem>
                                <SelectItem value="stock">
                                    {l('В наличии', 'In stock', 'Ir noliktavā')}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Section>
            <Section
                title={l(
                    '11 · Вкладки и раскрывающиеся блоки',
                    '11 · Tabs and accordions',
                    '11 · Cilnes un izvēršami bloki'
                )}
            >
                <p className="text-sm text-muted-foreground">
                    {l(
                        'Tabs переключают равноправные разделы; Accordion раскрывает дополнительную информацию. Проверяйте навигацию клавиатурой и длинные названия на мобильном экране.',
                        'Tabs switch between peer sections; Accordion reveals additional information. Check keyboard navigation and long labels on mobile.',
                        'Tabs pārslēdz līdzvērtīgas sadaļas; Accordion atklāj papildu informāciju. Pārbaudiet tastatūras navigāciju un garus nosaukumus mobilajā ekrānā.'
                    )}
                </p>
                <Tabs defaultValue="details">
                    <TabsList className="h-auto flex-wrap">
                        <TabsTrigger value="details">
                            {l('Описание', 'Description', 'Apraksts')}
                        </TabsTrigger>
                        <TabsTrigger value="delivery">
                            {l('Доставка', 'Delivery', 'Piegāde')}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="details" className="text-sm">
                        {l(
                            'Содержимое раздела описания.',
                            'Description section content.',
                            'Apraksta sadaļas saturs.'
                        )}
                    </TabsContent>
                    <TabsContent value="delivery" className="text-sm">
                        {l(
                            'Содержимое раздела доставки.',
                            'Delivery section content.',
                            'Piegādes sadaļas saturs.'
                        )}
                    </TabsContent>
                </Tabs>
                <Accordion type="single" collapsible className="max-w-xl">
                    <AccordionItem value="extra">
                        <AccordionTrigger>
                            {l(
                                'Дополнительная информация',
                                'Additional information',
                                'Papildu informācija'
                            )}
                        </AccordionTrigger>
                        <AccordionContent>
                            {l(
                                'Рабочий Accordion из компонентов проекта.',
                                'Production Accordion from the project components.',
                                'Projekta Accordion komponents.'
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </Section>
            <Section
                title={l(
                    '12 · Диалоги, меню и уведомления',
                    '12 · Dialogs, menus and notifications',
                    '12 · Dialogi, izvēlnes un paziņojumi'
                )}
            >
                <p className="text-sm text-muted-foreground">
                    {l(
                        'Диалог требует заголовка, описания и явного действия. Escape закрывает окно, фокус возвращается к кнопке. Toast подтверждает результат; ошибку поля показывайте непосредственно у поля.',
                        'A dialog needs a title, description and explicit action. Escape closes it and focus returns to the trigger. Toast confirms a result; show field errors beside the field.',
                        'Dialogam vajadzīgs virsraksts, apraksts un skaidra darbība. Escape to aizver un atgriež fokusu pogai. Toast apstiprina rezultātu; lauka kļūdu rādiet blakus laukam.'
                    )}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline">
                                {l(
                                    'Открыть диалог',
                                    'Open dialog',
                                    'Atvērt dialogu'
                                )}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>
                                    {l(
                                        'Демонстрационный диалог',
                                        'Demo dialog',
                                        'Demonstrācijas dialogs'
                                    )}
                                </DialogTitle>
                                <DialogDescription>
                                    {l(
                                        'Пример рабочего компонента. Данные не сохраняются.',
                                        'Production component example. No data is saved.',
                                        'Projekta komponenta piemērs. Dati netiek saglabāti.'
                                    )}
                                </DialogDescription>
                            </DialogHeader>
                            <Hint
                                content={l(
                                    'Подсказка отображается поверх диалога.',
                                    'The hint appears above the dialog.',
                                    'Padoms tiek rādīts virs dialoga.'
                                )}
                            >
                                <Button variant="outline">
                                    {l(
                                        'Подсказка в диалоге',
                                        'Hint inside dialog',
                                        'Padoms dialogā'
                                    )}
                                </Button>
                            </Hint>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button>
                                        {l('Закрыть', 'Close', 'Aizvērt')}
                                    </Button>
                                </DialogClose>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <MoreHorizontal aria-hidden="true" />
                                {l('Действия', 'Actions', 'Darbības')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem
                                onSelect={() =>
                                    setNotice(
                                        l(
                                            'Выбрано демонстрационное действие.',
                                            'Demo action selected.',
                                            'Izvēlēta demonstrācijas darbība.'
                                        )
                                    )
                                }
                            >
                                {l(
                                    'Выбрать действие',
                                    'Select action',
                                    'Izvēlēties darbību'
                                )}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                                {l(
                                    'Недоступное действие',
                                    'Unavailable action',
                                    'Nepieejama darbība'
                                )}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {(['success', 'error', 'info'] as const).map((type) => (
                        <Button
                            key={type}
                            variant="outline"
                            onClick={() =>
                                showToast(
                                    l(
                                        'Демонстрационное уведомление',
                                        'Demo notification',
                                        'Demonstrācijas paziņojums'
                                    ),
                                    type
                                )
                            }
                        >
                            Toast · {type}
                        </Button>
                    ))}
                    <Button disabled>
                        <Loader2 aria-hidden="true" className="animate-spin" />
                        {l('Загрузка', 'Loading', 'Ielāde')}
                    </Button>
                </div>
                <p role="status" className="text-sm text-muted-foreground">
                    {notice}
                </p>
            </Section>
            <Section
                title={l(
                    '13 · Паттерны магазина',
                    '13 · Store patterns',
                    '13 · Veikala piemēri'
                )}
            >
                <p className="text-sm text-muted-foreground">
                    {l(
                        'ProductPreviewCard — реальный предпросмотр из редактора товара: цена, метки, остаток и составной контрол покупки. Кнопки в предпросмотре статичны. Это демонстрация с заданными данными, а не интерактивная карточка каталога.',
                        'ProductPreviewCard is the production preview from the product editor: price, badges, stock and purchase control. Its buttons are static. This uses sample data; it is not an interactive catalog card.',
                        'ProductPreviewCard ir preču redaktora priekšskatījums: cena, etiķetes, atlikums un pirkuma vadīkla. Pogas ir statiskas. Tiek izmantoti piemēra dati; tā nav interaktīva kataloga kartīte.'
                    )}
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ProductPreviewCard
                        title={item}
                        brand="HairShop-Pro"
                        price={24}
                        oldPrice={30}
                        stock={12}
                        badges={['new', 'sale']}
                        rating={4.8}
                        bulkPricingTiers={[{ quantity: 3, pricePerUnit: 22 }]}
                    />
                    <ProductPreviewCard
                        title={item}
                        brand="HairShop-Pro"
                        price={24}
                        stock={0}
                    />
                    <div>
                        <p className="mb-2 text-sm text-muted-foreground">
                            ProductCardSkeleton
                        </p>
                        <ProductCardSkeleton />
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    {l(
                        'BonusSection ниже использует текущие настройки бонусной программы и скрывается, если программа выключена.',
                        'BonusSection below uses current program settings and is hidden when the program is disabled.',
                        'BonusSection zemāk izmanto pašreizējos programmas iestatījumus un netiek rādīts, ja programma ir izslēgta.'
                    )}
                </p>
                <BonusSection />
            </Section>
            <Section
                title={l(
                    '14 · Таблицы админки и состояния списка',
                    '14 · Admin tables and list states',
                    '14 · Administrācijas tabulas un saraksta stāvokļi'
                )}
            >
                <p className="text-sm text-muted-foreground">
                    {l(
                        'Составной пример: StickyTableHead и Button из проекта, демонстрационные строки и локальная пагинация. На узком экране таблица прокручивается горизонтально. Пустой список объясняет причину и предлагает действие; загрузка использует AdminTableSkeleton.',
                        'Composed example: production StickyTableHead and Button, sample rows and local pagination. On narrow screens the table scrolls horizontally. Empty lists explain the cause and offer an action; loading uses AdminTableSkeleton.',
                        'Salikts piemērs: projekta StickyTableHead un Button, piemēra rindas un lokāla lapošana. Šauros ekrānos tabula ritinās horizontāli. Tukšs saraksts izskaidro iemeslu un piedāvā darbību; ielādei izmanto AdminTableSkeleton.'
                    )}
                </p>
                <Button
                    variant="outline"
                    onClick={() => {
                        setEmpty(!empty);
                        setPage(1);
                    }}
                >
                    {empty
                        ? l('Показать строки', 'Show rows', 'Rādīt rindas')
                        : l(
                              'Показать пустое состояние',
                              'Show empty state',
                              'Rādīt tukšu stāvokli'
                          )}
                </Button>
                {empty ? (
                    <div className="rounded-xl border border-border bg-card p-6 text-center">
                        <p className="font-semibold">
                            {l(
                                'Товары не найдены',
                                'No products found',
                                'Preces nav atrastas'
                            )}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {l(
                                'Попробуйте сбросить фильтры.',
                                'Try clearing the filters.',
                                'Mēģiniet atiestatīt filtrus.'
                            )}
                        </p>
                        <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => setEmpty(false)}
                        >
                            {l(
                                'Сбросить фильтры',
                                'Clear filters',
                                'Atiestatīt filtrus'
                            )}
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto rounded-xl border border-border bg-card">
                            <table className="w-full min-w-[480px] text-sm">
                                <caption className="sr-only">
                                    {l(
                                        'Демонстрационный список товаров',
                                        'Demo product list',
                                        'Demonstrācijas preču saraksts'
                                    )}
                                </caption>
                                <StickyTableHead>
                                    <tr>
                                        {[
                                            'ID',
                                            l('Товар', 'Product', 'Prece'),
                                            l('Цена', 'Price', 'Cena'),
                                        ].map((label) => (
                                            <th
                                                key={label}
                                                scope="col"
                                                className="px-4 py-3 text-left font-medium text-muted-foreground"
                                            >
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </StickyTableHead>
                                <tbody>
                                    {[1, 2].map((row) => (
                                        <tr
                                            key={row}
                                            className="border-b border-border last:border-0 hover:bg-muted/50"
                                        >
                                            <td className="px-4 py-3">
                                                {(page - 1) * 2 + row}
                                            </td>
                                            <td className="px-4 py-3">
                                                {item}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums">
                                                €24.00
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <nav
                            aria-label={l(
                                'Пагинация примера',
                                'Demo pagination',
                                'Piemēra lapošana'
                            )}
                            className="flex flex-wrap items-center gap-3"
                        >
                            <Button
                                variant="outline"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                            >
                                {l('Назад', 'Previous', 'Iepriekšējā')}
                            </Button>
                            <span aria-live="polite" className="text-sm">
                                {page} / 2
                            </span>
                            <Button
                                variant="outline"
                                disabled={page === 2}
                                onClick={() => setPage(page + 1)}
                            >
                                {l('Далее', 'Next', 'Nākamā')}
                            </Button>
                        </nav>
                    </>
                )}
                <AdminTableSkeleton rows={2} cols={3} />
            </Section>
            <Section
                title={l(
                    '15 · Правила применения',
                    '15 · Usage rules',
                    '15 · Lietošanas noteikumi'
                )}
            >
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                    <li>
                        {l(
                            'Цвета поверхностей и текста берите из семантических токенов. Brand — фирменный синий; primary — контрастное основное действие, меняющее цвет в тёмной теме.',
                            'Use semantic tokens for surfaces and text. Brand is the brand blue; primary is the contrasting main action and changes color in dark mode.',
                            'Virsmām un tekstam izmantojiet semantiskos marķierus. Brand ir zīmola zilais; primary ir kontrastējoša galvenā darbība, kas maina krāsu tumšajā tēmā.'
                        )}
                    </li>
                    <li>
                        {l(
                            'Indigo — покупка, pink — избранное, зелёный — успех, красный — ошибка или опасное действие. Эти проектные цвета пока заданы классами, а не отдельными семантическими токенами.',
                            'Indigo is purchase, pink is favorites, green is success, red is error or destructive action. These project colors currently use classes rather than dedicated semantic tokens.',
                            'Indigo apzīmē pirkumu, pink — izlasi, zaļš — veiksmi, sarkans — kļūdu vai bīstamu darbību. Šīs krāsas pašlaik izmanto klases, nevis atsevišķus semantiskos marķierus.'
                        )}
                    </li>
                    <li>
                        {l(
                            'Основное действие — default; вторичное — outline; действие без акцента — ghost; удаление — destructive. Для заметного действия на мобильном экране используйте размер cta или icon с областью от 44 px.',
                            'Use default for the main action, outline for secondary actions, ghost for low emphasis and destructive for deletion. Use cta or icon for a mobile action with a target of at least 44 px.',
                            'Galvenajai darbībai izmantojiet default, sekundārajai — outline, mazāk izceltai — ghost, dzēšanai — destructive. Mobilajām darbībām izmantojiet cta vai icon ar vismaz 44 px laukumu.'
                        )}
                    </li>
                    <li>
                        {l(
                            'У поля должна быть связанная метка; ошибка — aria-invalid и aria-describedby. Placeholder не заменяет метку. Проверяйте normal, focus, disabled, error и loading.',
                            'Fields need an associated label; errors need aria-invalid and aria-describedby. A placeholder does not replace a label. Check normal, focus, disabled, error and loading states.',
                            'Laukam vajadzīga saistīta etiķete; kļūdai — aria-invalid un aria-describedby. Vietturis neaizstāj etiķeti. Pārbaudiet normal, focus, disabled, error un loading stāvokļus.'
                        )}
                    </li>
                    <li>
                        {l(
                            'Проверяйте светлую и тёмную темы, ширину от 320 px и все три языка: RU, EN, LV. Не фиксируйте ширину текстовых кнопок; длинные подписи должны помещаться или переноситься.',
                            'Check light and dark themes, widths from 320 px and all three languages: RU, EN, LV. Avoid fixed widths for text buttons; long labels must fit or wrap.',
                            'Pārbaudiet gaišo un tumšo tēmu, platumu no 320 px un visas trīs valodas: RU, EN, LV. Teksta pogām neizmantojiet fiksētu platumu; gariem tekstiem jāietilpst vai jāpārnesas.'
                        )}
                    </li>
                    <li>
                        {l(
                            'Слои: header 100 → drawer 200 → modal 300 → dropdown и tooltip 400 → toast 500. Используйте именованные классы из tailwind.config.cjs.',
                            'Layers: header 100 → drawer 200 → modal 300 → dropdown and tooltip 400 → toast 500. Use named classes from tailwind.config.cjs.',
                            'Slāņi: header 100 → drawer 200 → modal 300 → dropdown un tooltip 400 → toast 500. Izmantojiet nosauktās klases no tailwind.config.cjs.'
                        )}
                    </li>
                    <li>
                        {l(
                            'Анимация раскрытия — ui-disclosure-in; базовые компоненты содержат свои переходы. Сохраняйте поддержку prefers-reduced-motion из globals.css.',
                            'Use ui-disclosure-in for disclosure animation; base components include their transitions. Preserve prefers-reduced-motion support from globals.css.',
                            'Izvēršanas animācijai izmantojiet ui-disclosure-in; pamata komponentiem ir savas pārejas. Saglabājiet prefers-reduced-motion atbalstu no globals.css.'
                        )}
                    </li>
                </ul>
            </Section>
        </>
    );
}
