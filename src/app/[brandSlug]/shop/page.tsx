import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBrand, getProducts } from '@/data';
import ProductGrid from '@/components/shop/ProductGrid';

interface PageProps {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ format?: string; gender?: string; family?: string }>;
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

export default async function ShopPage({ params, searchParams }: PageProps) {
  const { brandSlug } = await params;
  const query = await searchParams;
  const brand = getBrand(brandSlug);

  if (!brand) {
    notFound();
  }

  const products = getProducts(brandSlug);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      {/* Editorial Page Header */}
      <div className="mb-12 border-b border-brand-border pb-8">
        <span className="text-[10px] uppercase tracking-widest text-brand-accent font-mono block mb-2">
          {brand.name} · Complete Collection
        </span>
        <h1 className="editorial-title font-serif text-3xl sm:text-5xl font-normal tracking-tight text-brand-text">
          {brand.designVariant === 'oriental-artisanal'
            ? 'The Attar Vault & Oriental Blends'
            : brand.designVariant === 'luxury-editorial'
            ? 'The Atelier Archives'
            : brand.designVariant === 'discovery-niche'
            ? 'Perfumery Lab Catalog'
            : brand.designVariant === 'sampling-concierge'
            ? 'The collection'
            : brand.designVariant === 'decant-finder'
            ? 'Shop fragrances'
            : brand.designVariant === 'souq-marketplace'
            ? 'Shop Arabic perfumes'
            : 'The Extrait Collection'}
        </h1>
        <p className="mt-3 text-sm sm:text-base text-brand-text-muted max-w-2xl leading-relaxed">
          {brand.designVariant === 'souq-marketplace'
            ? 'Browse in-stock Arabic and Middle Eastern bottles, or skip the filters and describe what you need.'
            : brand.specialty || `Explore the complete olfactory repertoire of ${brand.name}.`}
        </p>
      </div>

      <ProductGrid
        products={products}
        brand={brand}
        initialFormat={query.format}
        initialGender={query.gender}
        initialFamily={query.family}
      />
    </div>
  );
}
