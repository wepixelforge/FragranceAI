import { Product } from '@/types/product';
import { GroundedProductContext } from '@/types/chat';

/**
 * Serializes an authoritative product from catalogue into trusted fields for LLM grounding.
 * Strictly avoids passing unnecessary UI props, internal flags, or raw styling tokens.
 */
export function serializeProductForGrounding(product: Product): GroundedProductContext {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    size: product.size,
    gender: product.gender,
    fragrance_family: product.fragranceFamily,
    notes: {
      top: product.topNotes,
      heart: product.heartNotes,
      base: product.baseNotes,
      all: [...product.topNotes, ...product.heartNotes, ...product.baseNotes],
    },
    occasion: product.occasion,
    season: product.season,
    intensity: product.intensity || null,
    projection: product.projection || (product.intensity === 'subtle' ? 'intimate' : product.intensity === 'strong' ? 'strong' : 'moderate'),
    longevity: product.longevity || null,
    character: product.character || null,
    inspired_by: product.similarTo || [],
    description: product.description,
    tags: product.tags,
  };
}

export function serializeProductListForGrounding(products: Product[]): GroundedProductContext[] {
  return products.map(serializeProductForGrounding);
}
