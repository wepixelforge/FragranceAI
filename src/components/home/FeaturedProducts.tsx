import Link from 'next/link';
import { BrandConfig } from '@/types/brand';
import { Product } from '@/types/product';
import ProductCard from '@/components/shop/ProductCard';

interface FeaturedProductsProps {
  brand: BrandConfig;
  products: Product[];
}

export default function FeaturedProducts({ brand, products }: FeaturedProductsProps) {
  const getSectionTitle = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return {
          title: 'Master Concentrated Attars',
          subtitle: 'Our most revered alcohol-free pure oils and rich oriental extraits.',
          cta: 'Explore Attar Vault',
        };
      case 'luxury-editorial':
        return {
          title: 'The Atelier Extraits',
          subtitle: 'Expressions of transcendent rarity crafted with 35% pure perfume oils.',
          cta: 'The Full Collection',
        };
      case 'discovery-niche':
        return {
          title: 'Climate-Tested Formulations',
          subtitle: 'Engineered for extreme heat resilience. Available in 10ml trials and 50ml EDPs.',
          cta: 'Browse Lab Catalog',
        };
      case 'sampling-concierge':
        return {
          title: 'Featured',
          subtitle: 'A few pieces from the collection — official samples and travel sizes you can try first.',
          cta: 'Shop the catalogue',
        };
      case 'decant-finder':
        return {
          title: 'Featured',
          subtitle: 'A few pieces from the collection — discovery sizes, decants and full bottles.',
          cta: 'Shop fragrances',
        };
      default:
        return {
          title: 'Featured Fragrances',
          subtitle: 'Our most celebrated 30% extraits, crafted for unforgettable sillage.',
          cta: 'View All Fragrances',
        };
    }
  };

  const info = getSectionTitle();

  return (
    <section id="featured" className="py-24 sm:py-32 border-t border-brand-border bg-brand-bg relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-14 border-b border-brand-border pb-6 gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-brand-accent font-mono block mb-2">
              Curated Selection
            </span>
            <h2 className="editorial-title font-serif text-3xl sm:text-4xl font-normal tracking-tight text-brand-text">
              {info.title}
            </h2>
            <p className="mt-2 text-sm sm:text-base text-brand-text-muted max-w-xl leading-relaxed">
              {info.subtitle}
            </p>
          </div>
          <Link
            href={`/${brand.slug}/shop`}
            className="group hidden sm:inline-flex items-center gap-2 text-xs uppercase tracking-widest font-medium transition-colors hover:text-brand-accent pb-1 border-b border-transparent hover:border-brand-accent"
            style={{ color: brand.colors.accent }}
          >
            <span>{info.cta}</span>
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} brand={brand} />
          ))}
        </div>

        <div className="mt-12 text-center sm:hidden">
          <Link
            href={`/${brand.slug}/shop`}
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-medium py-3 px-6 rounded-full hairline-border"
            style={{ color: brand.colors.accent }}
          >
            <span>{info.cta}</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
