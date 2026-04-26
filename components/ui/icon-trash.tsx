import * as React from "react";

export const IconTrash = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    aria-hidden="true"
    {...props}
  >
    <rect x="5" y="9" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" />
    <path d="M10 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default IconTrash;
