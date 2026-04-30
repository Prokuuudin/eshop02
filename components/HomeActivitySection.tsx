'use client';
import dynamic from 'next/dynamic';
const ActivitySection = dynamic(() => import('./ui/activity/ActivitySection'));

export default function HomeActivitySection() {
    return <ActivitySection />;
}
