"use client";

import dynamic from "next/dynamic";

const AboutSection = dynamic(() => import("./AboutSection"), { ssr: false });

export default function HomeClient() {
  return <AboutSection />;
}
