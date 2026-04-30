import * as React from 'react';

export const IconCart = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        aria-hidden="true"
        {...props}
    >
        <circle cx="9" cy="21" r="1" fill="currentColor" />
        <circle cx="20" cy="21" r="1" fill="currentColor" />
        <path
            d="M1 1h2l3.6 7.59a1 1 0 0 0 .83.41H19a1 1 0 0 0 .96-.74l3-9A1 1 0 0 0 22 0H6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M7 18h13a1 1 0 0 0 1-1V6H6.21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

export default IconCart;
