export function OrderFormSection({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
    return (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </h2>
            {children}
        </div>
    );
}

export function OrderFormField({
    label,
    required,
    children,
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
            </span>
            {children}
        </label>
    );
}
