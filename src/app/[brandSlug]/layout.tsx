import { notFound } from 'next/navigation';
import { getBrand, getAllBrandSlugs, getProducts } from '@/data';
import { getBrandCssVars } from '@/lib/brand-utils';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import FloatingConcierge from '@/components/layout/FloatingConcierge';
import { ScentFinderProvider } from '@/context/ScentFinderContext';

export function generateStaticParams() {
  return getAllBrandSlugs().map((slug) => ({ brandSlug: slug }));
}

interface BrandLayoutProps {
  children: React.ReactNode;
  params: Promise<{ brandSlug: string }>;
}

export default async function BrandLayout({ children, params }: BrandLayoutProps) {
  const { brandSlug } = await params;
  const brand = getBrand(brandSlug);

  if (!brand) {
    notFound();
  }

  const products = getProducts(brandSlug);
  const cssVars = getBrandCssVars(brand);

  return (
    <div
      data-brand={brand.slug}
      className="flex min-h-screen flex-col bg-brand-bg text-brand-text"
    >
      <ScentFinderProvider brand={brand} products={products}>
        <Header brand={brand} />
        <main className="flex-1">{children}</main>
        <Footer brand={brand} />
        <FloatingConcierge brand={brand} products={products} />
      </ScentFinderProvider>
    </div>
  );
}
