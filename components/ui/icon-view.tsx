import * as React from "react";

export const IconGrid = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    aria-hidden="true"
    {...props}
  >
    <rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const IconList = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    aria-hidden="true"
    {...props}
  >
    <rect x="4" y="5" width="16" height="2" rx="1" fill="currentColor" />
    <rect x="4" y="11" width="16" height="2" rx="1" fill="currentColor" />
    <rect x="4" y="17" width="16" height="2" rx="1" fill="currentColor" />
  </svg>
);
