import { Card } from './ui/card';

export default function BrandCardSkeleton() {
  return (
    <Card className="brand-card p-4 flex flex-col items-center animate-pulse bg-card border border-border">
      <div className="w-16 h-16 rounded-full bg-muted mb-3" />
      <div className="h-4 w-24 bg-muted rounded mb-2" />
      <div className="h-3 w-32 bg-muted rounded mb-2" />
      <div className="h-5 w-20 bg-muted rounded mt-2" />
    </Card>
  );
}
