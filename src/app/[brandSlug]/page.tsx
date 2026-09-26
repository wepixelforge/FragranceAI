import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBrand, getFeaturedProducts, getProducts } from '@/data';
import HeroSection from '@/components/home/HeroSection';
import FeaturedProducts from '@/components/home/FeaturedProducts';
import BusinessValueSection from '@/components/home/BusinessValueSection';
import StorySection from '@/components/home/StorySection';
import FragranceFamiliesSection from '@/components/home/FragranceFamiliesSection';
import QuickDiscoverySection from '@/components/home/QuickDiscoverySection';
import ScentStoriesHelpStrip from '@/components/home/ScentStoriesHelpStrip';
import ScentStoriesFormatsSection from '@/components/home/ScentStoriesFormatsSection';
import ScentStoriesPurposesSection from '@/components/home/ScentStoriesPurposesSection';
import ScentStoriesHowItWorks from '@/components/home/ScentStoriesHowItWorks';
import ScentStoriesCollectionRow from '@/components/home/ScentStoriesCollectionRow';
import ScentiraHero from '@/components/home/ScentiraHero';
import ScentiraHelpStrip from '@/components/home/ScentiraHelpStrip';
import ScentiraFormatsSection from '@/components/home/ScentiraFormatsSection';
import ScentiraHowItWorks from '@/components/home/ScentiraHowItWorks';
import SouqScentHero from '@/components/home/SouqScentHero';
import SouqScentHelpStrip from '@/components/home/SouqScentHelpStrip';
import SouqScentOccasions from '@/components/home/SouqScentOccasions';

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
  const catalogue = getProducts(brandSlug);
  const heroProduct = featuredProducts[0];
  const sectionsOrder = brand.homepage.sectionsOrder || ['hero', 'featured', 'value'];
  const samples = catalogue.filter((p) => p.format === 'sample');
  const pockets = catalogue.filter((p) => p.format === 'pocket');
  const discoverySets = catalogue.filter((p) => p.format === 'discovery-set');

  return (
    <>
      {sectionsOrder.map((sectionKey, idx) => {
        switch (sectionKey) {
          case 'hero':
            return brand.slug === 'scentira' ? (
              <ScentiraHero key={`hero-${idx}`} brand={brand} />
            ) : brand.slug === 'souqscent' ? (
              <SouqScentHero key={`hero-${idx}`} brand={brand} />
            ) : (
              <HeroSection key={`hero-${idx}`} brand={brand} heroProduct={heroProduct} />
            );
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
          case 'concierge':
          case 'help':
            return brand.slug === 'scentira' ? (
              <ScentiraHelpStrip key={`help-${idx}`} brand={brand} />
            ) : brand.slug === 'souqscent' ? (
              <SouqScentHelpStrip key={`help-${idx}`} brand={brand} />
            ) : (
              <ScentStoriesHelpStrip key={`help-${idx}`} brand={brand} />
            );
          case 'formats':
            return brand.slug === 'scentira' ? (
              <ScentiraFormatsSection key={`formats-${idx}`} />
            ) : (
              <ScentStoriesFormatsSection key={`formats-${idx}`} brand={brand} />
            );
          case 'purposes':
            return brand.slug === 'souqscent' ? (
              <SouqScentOccasions key={`purposes-${idx}`} />
            ) : (
              <ScentStoriesPurposesSection key={`purposes-${idx}`} brand={brand} />
            );
          case 'how-it-works':
            return brand.slug === 'scentira' ? (
              <ScentiraHowItWorks key={`how-${idx}`} />
            ) : (
              <ScentStoriesHowItWorks key={`how-${idx}`} />
            );
          case 'samples':
            return (
              <ScentStoriesCollectionRow
                key={`samples-${idx}`}
                brand={brand}
                products={samples}
                eyebrow="Samples"
                title="Official samples"
                href={`/${brand.slug}/shop?format=sample`}
                hrefLabel="Shop samples"
              />
            );
          case 'pocket':
            return (
              <ScentStoriesCollectionRow
                key={`pocket-${idx}`}
                brand={brand}
                products={pockets}
                eyebrow="Travel"
                title="Pocket perfumes"
                href={`/${brand.slug}/shop?format=pocket`}
                hrefLabel="Shop pocket sizes"
              />
            );
          case 'discovery-sets':
            return (
              <ScentStoriesCollectionRow
                key={`sets-${idx}`}
                brand={brand}
                products={discoverySets}
                eyebrow="Discovery sets"
                title="Explore a house"
                href={`/${brand.slug}/shop?format=discovery-set`}
                hrefLabel="Shop discovery sets"
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
