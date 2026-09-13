import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBrand, getProducts } from '@/data';
import ProductGrid from '@/components/shop/ProductGrid';

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brandSlug } = await params;
  const brand = getBrand(brandSlug);
  if (!brand) return {};
  return {
    title: `Shop — ${brand.name}`,
    description: `Browse the complete ${brand.name} fragrance collection. Find your perfect scent.`,
  };
}

export default async function ShopPage({ params }: PageProps) {
  const { brandSlug } = await params;
  const brand = getBrand(brandSlug);

  if (!brand) {
    notFound();
  }

  const products = getProducts(brandSlug);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      {/* Page header */}
      <div className="mb-10">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-brand-text sm:text-4xl">
          {brand.designVariant === 'oriental-artisanal'
            ? 'The Attar Vault & Oriental Blends'
            : brand.designVariant === 'luxury-editorial'
            ? 'The Atelier Archives'
            : brand.designVariant === 'discovery-niche'
            ? 'Perfumery Lab Catalog'
            : 'Our Extrait Collection'}
        </h1>
        <p className="mt-2 text-brand-text-muted">
          {brand.specialty || `Explore the complete ${brand.name} fragrance range.`}
        </p>
      </div>

      <ProductGrid products={products} brand={brand} />
    </div>
  );
}
