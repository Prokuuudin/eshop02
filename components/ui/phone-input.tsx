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
    // Re-parsing on every keystroke fights the library's own AsYouType state
    // (it stops applying defaultCountry mid-typing). Only normalize a value
    // that came from outside this component (saved address, prefill) — skip
    // it for a value we just emitted ourselves via onChange.
    const [lastEmitted, setLastEmitted] = React.useState('')
    const e164Value = value === lastEmitted
        ? value || undefined
        : normalizePhoneInputValue(value, defaultCountry)

    const handleChange = (val: string | undefined): void => {
        const next = val ?? ''
        setLastEmitted(next)
        onChange(next)
    }

    return (
        <ReactPhoneInput
            defaultCountry={defaultCountry}
            flags={flags}
            value={e164Value}
            onChange={handleChange}
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
