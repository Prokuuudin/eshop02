"use client";
import { Dialog, DialogContent } from "./ui/dialog";
import { FadeTransition } from "./FadeTransition";
import { useTranslation } from '@/lib/use-translation'

export default function PageLoader({ show }: { show: boolean }) {
  const { t } = useTranslation()
  return (
    <Dialog open={show}>
      <DialogContent className="flex items-center justify-center bg-transparent border-none shadow-none">
        <FadeTransition show={show} duration={400}>
          <div className="flex flex-col items-center">
            <span className="animate-spin rounded-full h-12 w-12 border-4 border-t-primary border-b-gray-200 border-l-gray-200 border-r-gray-200" />
            <span className="mt-4 text-lg font-medium text-gray-700">{t('common.loading')}</span>
          </div>
        </FadeTransition>
      </DialogContent>
    </Dialog>
  );
}
