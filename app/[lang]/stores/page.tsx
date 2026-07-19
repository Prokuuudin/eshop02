import Stores from '@/components/Stores';
import { resolveLanguage } from '@/lib/i18n-routing';

export default async function StoresPage({ params }: { params: Promise<{ lang: string }> }): Promise<JSX.Element> {
  const language = resolveLanguage((await params).lang);
  return <Stores language={language} />;
}
