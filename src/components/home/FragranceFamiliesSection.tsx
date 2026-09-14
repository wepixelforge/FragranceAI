'use client';

import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

interface FragranceFamiliesSectionProps {
  brand: BrandConfig;
}

export default function FragranceFamiliesSection({ brand }: FragranceFamiliesSectionProps) {
  // Brand-tailored families
  const getFamilies = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return [
          {
            name: 'Aged Dehn Al Oud',
            desc: 'Aged Assam and Cambodian agarwood distillations. Dark, resinous, smokey.',
            tag: 'Authentic Oud',
            query: 'Traditional dehn al oud perfume oil',
            gradient: 'from-[#2B1B10] to-[#0A0704]',
          },
          {
            name: 'Luminous White Amber',
            desc: 'Honeyed ambergris accords with gentle musk. Warm, comforting, close to skin.',
            tag: 'Intimate Trail',
            query: 'Sweet honeyed amber roll-on',
            gradient: 'from-[#38260F] to-[#120C05]',
          },
          {
            name: 'Taif & Damascus Rose',
            desc: 'Pure distilled highland petals folded with creamy sandalwood.',
            tag: 'Floral Royalty',
            query: 'Taif rose attar oil',
            gradient: 'from-[#2D0D18] to-[#0F0408]',
          },
          {
            name: 'Spicy Shamama & Mukhallat',
            desc: 'Ancient herbal blends infused with saffron, nutmeg, and black musk.',
            tag: 'Sacred Blend',
            query: 'Warm spicy shamama mukhallat',
            gradient: 'from-[#28150A] to-[#0B0602]',
          },
        ];
      case 'luxury-editorial':
        return [
          {
            name: 'Aristocratic Citrus & Woods',
            desc: 'Grapefruit and bergamot sharpened over cedar and pink pepper.',
            tag: '35% Extrait',
            query: 'Crisp citrus and rare cedarwood like Roja Elysium',
            gradient: 'from-[#051F18] to-[#010D0A]',
          },
          {
            name: 'Boozy Cognac & Tonka',
            desc: 'Oak barrel cognac, cinnamon bark, and roasted praline gourmand.',
            tag: 'Atelier Blend',
            query: 'Warm boozy gourmand like Kilian Angels Share',
            gradient: 'from-[#261408] to-[#0B0502]',
          },
          {
            name: 'Imperial Leather & Oud',
            desc: 'Smokey Tuscan leather, castoreum accord, and royal agarwood.',
            tag: 'Sovereign Sillage',
            query: 'Commanding winter leather and oud',
            gradient: 'from-[#1A1208] to-[#080502]',
          },
          {
            name: 'Extrait Amber & Florals',
            desc: 'Saffron threads, bitter almond, and radiant cedarwood ambergris.',
            tag: 'Haute Parfumerie',
            query: 'Baccarat Rouge 540 Extrait inspired expression',
            gradient: 'from-[#1F0A14] to-[#0A0306]',
          },
        ];
      case 'discovery-niche':
        return [
          {
            name: 'Oceanic Aquatics (42°C Tested)',
            desc: 'High-salinity marine accords and cold Italian bergamot that resist humid fade.',
            tag: 'High Heat Adhesion',
            query: 'Fresh aquatic perfume for summer heat',
            gradient: 'from-[#0A1D33] to-[#040C14]',
          },
          {
            name: 'Warm Monsoon Woods',
            desc: 'Petrichor, wet cedar, and rainy cardamom formulated for rainy weather.',
            tag: 'Rain & Humidity',
            query: 'Cozy cardamom chai scent for rainy monsoons',
            gradient: 'from-[#11232B] to-[#050D11]',
          },
          {
            name: 'Café Gourmand & Spices',
            desc: 'Dark roasted Arabica coffee, Madagascar vanilla, and spicy pink pepper.',
            tag: 'Date Night DNA',
            query: 'Dark roasted coffee and vanilla perfume',
            gradient: 'from-[#26150E] to-[#0D0704]',
          },
          {
            name: 'Modern Smoky Woods',
            desc: 'Smoky birch, patchouli, and pineapple formulated for everyday city endurance.',
            tag: 'Beast Mode Trail',
            query: 'Smoky birch and pineapple perfume',
            gradient: 'from-[#141C24] to-[#06090C]',
          },
        ];
      default:
        return [
          {
            name: 'Woody & Earthy',
            desc: 'Sandalwood, cedar, vetiver, and smoky agarwood bases.',
            tag: 'Warm & Grounded',
            query: 'I want something woody and earthy',
            gradient: 'from-[#2B1B10] to-[#0A0704]',
          },
          {
            name: 'Fresh & Aquatic',
            desc: 'Crisp citrus, sea breeze, and revitalizing ozonic notes.',
            tag: 'Clean & Energetic',
            query: 'I want something fresh and clean for office use',
            gradient: 'from-[#0D222E] to-[#040B0F]',
          },
          {
            name: 'Warm & Sweet Gourmand',
            desc: 'Bourbon vanilla, tonka bean, honey, and cozy amber.',
            tag: 'Intimate Evening',
            query: 'I want something sweet for date night under ₹1000',
            gradient: 'from-[#2B160C] to-[#0E0704]',
          },
          {
            name: 'Spicy & Oriental',
            desc: 'Cardamom, cinnamon, saffron, and exotic resins.',
            tag: 'Mysterious & Bold',
            query: 'I want an oriental spicy perfume',
            gradient: 'from-[#24131C] to-[#0D060A]',
          },
        ];
    }
  };

  const families = getFamilies();

  return (
    <section className="py-24 sm:py-32 border-t border-brand-border bg-brand-bg relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-14 border-b border-brand-border pb-6 gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-brand-accent font-mono block mb-2">
              Olfactory Architecture
            </span>
            <h2 className="editorial-title font-serif text-3xl sm:text-4xl font-normal tracking-tight text-brand-text">
              Explore by Scent Family
            </h2>
            <p className="mt-2 text-sm sm:text-base text-brand-text-muted max-w-xl leading-relaxed">
              Select an accord to explore harmonized creations guided by our Scent Concierge.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {families.map((fam, i) => (
            <Link
              key={i}
              href={`/${brand.slug}/finder?q=${encodeURIComponent(fam.query)}`}
              className="group block"
            >
              <div
                className={`relative rounded-xl overflow-hidden bg-gradient-to-b ${fam.gradient} p-7 hairline-border transition-all duration-300 group-hover:border-brand-accent/60 flex flex-col justify-between h-72 text-white`}
              >
                <div>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border border-white/15 text-white/80 font-mono inline-block">
                    {fam.tag}
                  </span>
                  <h3 className="font-serif text-xl font-normal text-white mt-4 group-hover:text-brand-accent transition-colors">
                    {fam.name}
                  </h3>
                  <p className="mt-3 text-xs text-white/60 leading-relaxed font-light">
                    {fam.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs tracking-widest uppercase font-medium text-brand-accent">
                  <span>Explore Accord</span>
                  <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
