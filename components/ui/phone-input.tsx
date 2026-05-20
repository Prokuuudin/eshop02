'use client';
import React from 'react';
import ReactPhoneInput, { type Country } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PhoneInputProps = {
    value: string;
    onChange: (value: string) => void;
    defaultCountry?: Country;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    required?: boolean;
    'aria-required'?: string | boolean;
    'aria-invalid'?: boolean;
};

export default function PhoneInput({
    value,
    onChange,
    defaultCountry = 'LV',
    placeholder,
    className,
    disabled,
    required,
    ...rest
}: PhoneInputProps) {
    const normalized = value ? value.replace(/\s+/g, '') : ''
    const e164Value = /^\+\d+$/.test(normalized) ? normalized : undefined

    return (
        <ReactPhoneInput
            international
            defaultCountry={defaultCountry}
            value={e164Value}
            onChange={(val) => onChange(val ?? '')}
            inputComponent={Input}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={cn('phone-input', className)}
            {...rest}
        />
    );
}
