import * as React from "react";

export const IconClose = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 56 56"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={56}
    height={56}
    aria-hidden="true"
    {...props}
  >
    <circle cx="28" cy="28" r="26" fill="currentColor" fillOpacity="0.08" />
    <path
      d="M18 18l20 20m0-20l-20 20"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
