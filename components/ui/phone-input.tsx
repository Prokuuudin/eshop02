'use client';
import React from 'react';
import ReactPhoneInput, { type Country } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { normalizePhoneInputValue } from '@/lib/phone';

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
}: PhoneInputProps): React.ReactElement {
    const e164Value = normalizePhoneInputValue(value, defaultCountry)

    return (
        <ReactPhoneInput
            international
            defaultCountry={defaultCountry}
            flags={flags}
            value={e164Value}
            onChange={(val) => onChange(val ?? '')}
            inputComponent={Input}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            name="phone"
            autoComplete="tel"
            className={cn('phone-input', className)}
            {...rest}
        />
    );
}
