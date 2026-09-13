import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBrand, getProduct, getProducts } from '@/data';
import ProductDetailComponent from '@/components/product/ProductDetail';

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

  // Find similar products from the same brand
  const allProducts = getProducts(brandSlug);
  const similarProducts = allProducts
    .filter((p) => p.id !== product.id)
    .filter((p) => {
      // Share at least one fragrance family or occasion
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
      />
    </div>
  );
}
