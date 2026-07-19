import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

// Unmatched paths inside a language tree (e.g. /en/no-such-page) must render
// the localized not-found page; without this catch-all Next.js would look for
// a root-level not-found outside app/[lang]/, which does not exist.
//
// notFound() is thrown from generateMetadata, not only from the page body:
// metadata resolves before the first byte is flushed, so the response carries a
// real 404 status. Thrown from the page body alone it would land inside the
// loading.tsx Suspense boundary after a 200 shell has already been streamed
// (soft 404).
export async function generateMetadata(): Promise<Metadata> {
  notFound()
}

export default function CatchAllNotFound(): never {
  notFound()
}
