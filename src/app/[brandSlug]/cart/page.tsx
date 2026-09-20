import { notFound } from 'next/navigation';
import { getBrand } from '@/data';
import CartPageClient from '@/components/cart/CartPageClient';

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export default async function CartPage({ params }: PageProps) {
  const { brandSlug } = await params;
  const brand = getBrand(brandSlug);
  if (!brand) notFound();
  return <CartPageClient brand={brand} />;
}
