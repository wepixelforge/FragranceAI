import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBrand, getFeaturedProducts } from '@/data';
import HeroSection from '@/components/home/HeroSection';
import FeaturedProducts from '@/components/home/FeaturedProducts';
import BusinessValueSection from '@/components/home/BusinessValueSection';
import StorySection from '@/components/home/StorySection';
import FragranceFamiliesSection from '@/components/home/FragranceFamiliesSection';
import QuickDiscoverySection from '@/components/home/QuickDiscoverySection';

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brandSlug } = await params;
  const brand = getBrand(brandSlug);
  if (!brand) return {};
  return {
    title: brand.meta.title,
    description: brand.meta.description,
  };
}

export default async function BrandHomePage({ params }: PageProps) {
  const { brandSlug } = await params;
  const brand = getBrand(brandSlug);

  if (!brand) {
    notFound();
  }

  const featuredProducts = getFeaturedProducts(brandSlug);
  const heroProduct = featuredProducts[0];
  const sectionsOrder = brand.homepage.sectionsOrder || ['hero', 'featured', 'value'];

  return (
    <>
      {sectionsOrder.map((sectionKey, idx) => {
        switch (sectionKey) {
          case 'hero':
            return <HeroSection key={`hero-${idx}`} brand={brand} heroProduct={heroProduct} />;
          case 'featured':
            return (
              <FeaturedProducts
                key={`featured-${idx}`}
                brand={brand}
                products={featuredProducts}
              />
            );
          case 'story':
            return <StorySection key={`story-${idx}`} brand={brand} />;
          case 'fragrance-families':
            return <FragranceFamiliesSection key={`families-${idx}`} brand={brand} />;
          case 'quick-discovery':
            return <QuickDiscoverySection key={`discovery-${idx}`} brand={brand} />;
          case 'value':
            return <BusinessValueSection key={`value-${idx}`} brand={brand} />;
          default:
            return null;
        }
      })}
    </>
  );
}
