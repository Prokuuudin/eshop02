import * as React from 'react';

export const IconChevron = (props: React.SVGProps<SVGSVGElement>): React.ReactElement => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        aria-hidden="true"
        {...props}
    >
        <path
            d="M15 6l-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

export default IconChevron;
