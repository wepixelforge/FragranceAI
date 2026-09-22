import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBrand, getProduct, getProducts } from '@/data';
import ProductDetailComponent from '@/components/product/ProductDetail';
import { relatedFormatProducts } from '@/lib/sampling-format';

interface PageProps {
  params: Promise<{ brandSlug: string; productSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brandSlug, productSlug } = await params;
  const brand = getBrand(brandSlug);
  const product = getProduct(brandSlug, productSlug);
  if (!brand || !product) return {};
  return {
    title: `${product.name} — ${brand.name}`,
    description: product.description,
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { brandSlug, productSlug } = await params;
  const brand = getBrand(brandSlug);
  const product = getProduct(brandSlug, productSlug);

  if (!brand || !product) {
    notFound();
  }

  const allProducts = getProducts(brandSlug);
  const similarProducts =
    brandSlug === 'thescentstories'
      ? allProducts
          .filter((p) => p.id !== product.id)
          .map((p) => {
            const sharedFamily = p.fragranceFamily.filter((f) =>
              product.fragranceFamily.includes(f)
            ).length;
            const sameHouse = Boolean(p.houseBrand && p.houseBrand === product.houseBrand);
            const sameLine = Boolean(p.lineageId && p.lineageId === product.lineageId);
            const sameFormat = p.format === product.format;
            const score =
              (sameLine ? 10 : 0) +
              (sameHouse ? 8 : 0) +
              sharedFamily * 3 +
              (sameFormat ? 2 : 0);
            return { p, score, sharedFamily, sameHouse, sameLine };
          })
          .filter(({ score, sharedFamily, sameHouse, sameLine }) =>
            score > 0 && (sharedFamily > 0 || sameHouse || sameLine)
          )
          .sort((a, b) => b.score - a.score)
          .map(({ p }) => p)
          .slice(0, 3)
      : allProducts
          .filter((p) => p.id !== product.id)
          .filter((p) => {
            const sharedFamily = p.fragranceFamily.some((f) =>
              product.fragranceFamily.includes(f)
            );
            const sharedOccasion = p.occasion.some((o) =>
              product.occasion.includes(o)
            );
            return sharedFamily || sharedOccasion;
          })
          .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <ProductDetailComponent
        product={product}
        brand={brand}
        similarProducts={similarProducts}
        relatedFormats={relatedFormatProducts(product, allProducts)}
      />
    </div>
  );
}
