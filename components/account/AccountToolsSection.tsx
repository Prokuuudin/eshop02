import React from 'react';
import Link from 'next/link';

interface Tool {
    title: string;
    description: string;
    href: string;
    linkLabel: string;
    icon: React.ElementType;
    classes: string;
    linkClasses: string;
}

interface AccountToolsSectionProps {
    accountTools: Tool[];
    children?: React.ReactNode;
}

const AccountToolsSection: React.FC<AccountToolsSectionProps> = ({ accountTools, children }) => (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {accountTools.map((tool) => (
            <div key={tool.href} className={`flex min-h-52 flex-col rounded-2xl border p-5 shadow-sm ${tool.classes}`}>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-gray-700 shadow-sm dark:bg-gray-950/40 dark:text-gray-200">
                    <tool.icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                    {tool.title}
                </p>
                <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{tool.description}</p>
                <Link
                    href={tool.href}
                    className={`mt-4 inline-block text-sm font-medium hover:underline ${tool.linkClasses}`}
                >
                    {tool.linkLabel}
                </Link>
            </div>
        ))}
        {children}
    </section>
);

export default AccountToolsSection;
