type NavigationItem = {
    href: string;
};

type NavigationSection<TItem extends NavigationItem> = {
    title: string;
    items: TItem[];
};

export function isAdminNavItemActive(pathname: string, href: string): boolean {
    const [baseHref] = href.split('#');
    if (!baseHref || baseHref === '/') return pathname === '/';
    return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
}

export function filterAdminNavSections<
    TItem extends NavigationItem,
    TSection extends NavigationSection<TItem>,
>(sections: TSection[], canAccess: (href: string) => boolean): TSection[] {
    return sections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => canAccess(item.href)),
        }))
        .filter((section) => section.items.length > 0) as TSection[];
}

export function findActiveAdminNavSection<TItem extends NavigationItem>(
    pathname: string,
    sections: Array<NavigationSection<TItem>>
): string | undefined {
    return sections.find((section) =>
        section.items.some((item) => isAdminNavItemActive(pathname, item.href))
    )?.title;
}
