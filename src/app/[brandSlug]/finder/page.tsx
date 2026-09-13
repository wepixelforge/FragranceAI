import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBrand, getProducts } from '@/data';
import FinderChat from '@/components/finder/FinderChat';

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brandSlug } = await params;
  const brand = getBrand(brandSlug);
  if (!brand) return {};
  return {
    title: `Fragrance Finder — ${brand.name}`,
    description: `Find your perfect fragrance from ${brand.name}. Describe what you love and our AI assistant will recommend the best matches.`,
  };
}

export default async function FinderPage({ params }: PageProps) {
  const { brandSlug } = await params;
  const brand = getBrand(brandSlug);

  if (!brand) {
    notFound();
  }

  const products = getProducts(brandSlug);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden">
      <FinderChat brand={brand} products={products} />
    </div>
  );
}
