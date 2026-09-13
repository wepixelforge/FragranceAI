# Fragrance AI Discovery Engine — Multi-Brand B2B Demo

An AI-powered fragrance discovery web application designed as a sales and pitch prototype for small and medium-sized Indian perfume brands.

Instead of forcing shoppers to navigate confusing multi-page catalogues with technical fragrance jargon (top notes, sillage, accords), this application allows customers to describe their vibe, budget, occasion, or designer fragrance references in everyday natural language and instantly receive personalized recommendations with plain-English rationales.

---

## 🌟 Key Highlights

- **Multi-Brand Architecture**: Single Next.js deployment serving bespoke branded storefronts via dynamic URL routing (`/:brandSlug`).
- **Dynamic Theming**: Each brand loads its own typography, primary/secondary luxury color palettes, brand messaging, tagline, and curated prompt pills.
- **Client-Side Recommendation Engine**: 10-factor weighted scoring algorithm with natural language parsing (no external LLM API required for zero-cost, instant-response demoing).
- **Designer Inspiration Mappings**: Direct matching for popular designer scents (e.g., Dior Sauvage, Creed Aventus, Baccarat Rouge 540, Tom Ford Tobacco Vanille, YSL Black Opium, etc.).
- **Production-Ready UX**: Filterable catalogue, detailed product views with interactive notes pyramids, conversational discovery chat, and B2B business pitch sections.
- **Modular & Decoupled**: Ready to connect to a production RAG or vector database backend with minimal refactoring.

---

## 🏢 Included Brand Demos

Visit any of the following routes to preview unique brand identities and themes:

| Brand | Route | Theme | Specialty |
|---|---|---|---|
| **TM Perfume House** *(Flagship)* | [`/tmperfumehouse`](http://localhost:3000/tmperfumehouse) | Deep Onyx & Warm Champagne Gold | Artisanal luxury extraits & designer-grade blends |
| **Arabian Aroma** | [`/arabianaroma`](http://localhost:3000/arabianaroma) | Midnight Navy & Radiant Amber Gold | Traditional attars, rich ouds & oriental perfumery |
| **Al Maham Perfumes** | [`/almaham`](http://localhost:3000/almaham) | Royal Emerald & Antique Gold | Heritage Arabian luxury & royal compositions |
| **World of Perfumers** | [`/worldofperfumers`](http://localhost:3000/worldofperfumers) | Dark Slate & Crisp Silver Metallic | Modern niche curation & global masterworks |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18.18+ or 20+
- npm, yarn, or pnpm

### Installation

```bash
# 1. Clone repository & navigate into project
cd fragrance-ai-demo

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser (redirects automatically to `/tmperfumehouse`).

### Production Build & Verification

```bash
npm run build
npm run start
```

---

## 📁 Project Architecture

```
src/
├── app/
│   ├── layout.tsx                     # Root layout with Geist font
│   ├── page.tsx                       # Root redirect -> /tmperfumehouse
│   ├── globals.css                    # Tailwind CSS + custom keyframes & luxury variables
│   └── [brandSlug]/
│       ├── layout.tsx                 # Brand CSS variable injector & Static Params
│       ├── page.tsx                   # Brand Homepage (Hero, Featured, B2B Pitch)
│       ├── shop/
│       │   └── page.tsx               # Filterable catalogue (Gender, Family, Price)
│       ├── product/[productSlug]/
│       │   └── page.tsx               # Product details, notes pyramid, similar scents
│       └── finder/
│           └── page.tsx               # AI Fragrance Finder conversational interface
├── components/
│   ├── layout/
│   │   ├── Header.tsx                 # Dynamic brand navigation with mobile drawer
│   │   └── Footer.tsx                 # Branded footer & discovery links
│   ├── home/
│   │   ├── HeroSection.tsx            # Luxury editorial hero with animated entrance
│   │   ├── FeaturedProducts.tsx       # Curated brand showcase
│   │   └── BusinessValueSection.tsx   # 6 B2B value proposition cards & conversion stats
│   ├── shop/
│   │   ├── ProductCard.tsx            # Card with CSS bottle visualization & hover tags
│   │   └── ProductGrid.tsx            # Multi-facet client filtering & sorting
│   ├── product/
│   │   └── ProductDetail.tsx          # Full showcase: Top/Heart/Base notes, performance meters
│   └── finder/
│       └── FinderChat.tsx             # Interactive conversation UI with streaming states
├── data/
│   ├── brands/                        # Brand configurations & themes
│   │   ├── tmperfumehouse.ts          # Primary brand config
│   │   ├── arabianaroma.ts
│   │   ├── almaham.ts
│   │   └── worldofperfumers.ts
│   ├── products/                      # Product catalogues
│   │   ├── tmperfumehouse-products.ts # 18 rich demo products with designer mappings
│   │   └── generic-products.ts        # Dynamic product factory for sibling demo brands
│   └── index.ts                       # Unified data access layer
├── lib/
│   ├── brand-utils.ts                 # CSS custom property injection & formatting
│   ├── query-parser.ts                # Natural language intent & parameter extractor
│   └── recommendation-engine.ts       # 10-factor weighted scoring & explanation generator
└── types/
    ├── brand.ts                       # BrandConfig & BrandTheme type definitions
    └── product.ts                     # Product, FragranceFamily, Occasion, MatchReason types
```

---

## 🧠 Recommendation Engine & Query Parser

The recommendation system delivers fast, explainable results without requiring expensive third-party APIs.

### 1. Intent Extraction (`query-parser.ts`)
The query parser extracts structured parameters from natural language inputs:
- **Budget constraints**: Under/below/around ₹X, price ranges, max caps.
- **Fragrance families**: Woody, oriental, fresh, floral, gourmand, aquatic, citrus, spicy.
- **Occasions**: Date night, daily wear, office, wedding, gym, evening party.
- **Seasons & Time of Day**: Summer, winter, monsoon, night, day.
- **Gender intent**: For men, women, unisex, boyfriend, wife.
- **Designer & Niche inspirations**: Recognizes Dior Sauvage, Baccarat Rouge, Aventus, Black Opium, Bleu de Chanel, etc.
- **Performance preferences**: Long-lasting, beast mode, subtle, intimate, projection.
- **Direct note references**: Vanilla, oud, coffee, iris, amber, rose, lavender, tobacco.

### 2. Weighted Scoring Algorithm (`recommendation-engine.ts`)
Each product in the brand's catalogue is scored against the parsed query using a weighted multi-factor model:

| Factor | Max Weight | Logic |
|---|---|---|
| **Designer Match (`similarTo`)** | **35 pts** | Exact or partial match to designer inspiration queries |
| **Budget Compliance** | **30 pts** | Full points if within budget; progressive decay if exceeding |
| **Fragrance Family** | **25 pts** | Match on primary or secondary olfactory families |
| **Occasion Fit** | **20 pts** | Product tagged for the requested setting |
| **Gender Target** | **15 pts** | Matches user or unisex fallback |
| **Specific Note Match** | **15 pts** | Presence of requested ingredients across top, heart, or base |
| **Season Appropriateness** | **10 pts** | Formulated for current or requested season |
| **Longevity & Sillage** | **10 pts** | Matches desired projection and lasting power |
| **Intensity Level** | **8 pts** | Subtle, moderate, or strong alignment |
| **Tag & Keyword Overlap** | **5 pts** | Secondary vibe descriptors |

### 3. Humanized Rationale Generation
The engine outputs structured `MatchReason` objects that construct clear, persuasive explanations for the shopper:
> *"Selected for your date night preference. Features rich bourbon vanilla and dark amber with exceptional 10-12 hour longevity that stays close and intimate."*

---

## 🛠️ How to Customize

### Adding a New Brand (in 3 steps)

1. **Create brand config** in `src/data/brands/yourbrand.ts`:
   ```typescript
   import { BrandConfig } from '@/types/brand';

   export const yourbrandConfig: BrandConfig = {
     slug: 'yourbrand',
     name: 'Your Brand Name',
     tagline: 'Handcrafted Fragrance Atelier',
     monogram: 'YB',
     theme: {
       primary: '#0B0F19',
       secondary: '#D4AF37',
       accent: '#F3E5AB',
       background: '#06080D',
       surface: '#111625',
       text: '#F8FAFC',
       textMuted: '#94A3B8',
       border: '#1E293B',
     },
     // ... navigation, hero copy, and sample prompts
   };
   ```

2. **Register brand** in `src/data/index.ts`:
   ```typescript
   import { yourbrandConfig } from './brands/yourbrand';

   const brands: Record<string, BrandConfig> = {
     tmperfumehouse: tmperfumehouseConfig,
     // ...
     yourbrand: yourbrandConfig,
   };
   ```

3. **(Optional)** Add brand-specific products in `src/data/products/yourbrand-products.ts` or let it use the fallback factory. Your brand is now live at `/yourbrand`!

### Adding Products

Add entries into `src/data/products/tmperfumehouse-products.ts`:

```typescript
{
  id: 'tm-19',
  brandSlug: 'tmperfumehouse',
  name: 'Velvet Santal',
  slug: 'velvet-santal',
  tagline: 'Creamy Australian sandalwood and cardamom',
  description: 'An alluring blend of creamy woods and warm spices...',
  price: 1299,
  size: '50ml / 1.7 fl oz',
  concentration: 'Extrait de Parfum',
  gender: 'unisex',
  fragranceFamily: 'woody',
  topNotes: ['Cardamom', 'Violet Leaf', 'Bergamot'],
  heartNotes: ['Iris', 'Papyrus', 'Ambroxan'],
  baseNotes: ['Sandalwood', 'Cedarwood', 'Leather'],
  occasions: ['daily', 'office', 'evening'],
  seasons: ['autumn', 'winter', 'spring'],
  longevity: 'long-lasting',
  intensity: 'moderate',
  tags: ['creamy', 'sophisticated', 'comforting'],
  similarTo: ['Santal 33', 'Le Labo Santal'],
  featured: true,
}
```

---

## 🔮 Upgrading to Real AI / Vector Search (RAG)

This frontend was deliberately architected so you can plug in a real LLM or Vector Database without redesigning the interface:

1. **Keep the Interface Contract**:
   The `FinderChat.tsx` component communicates via `recommend(brandSlug, userQuery)`.
2. **Add an API Route**:
   Create `src/app/api/recommend/route.ts`:
   - Send `userQuery` to OpenAI / Claude / Gemini with your product catalogue passed in system context, or:
   - Query Pinecone / pgvector / Qdrant with embeddings generated from `name + description + notes + occasions`.
3. **Switch Engine Call**:
   In `src/components/finder/FinderChat.tsx`, replace the local `recommend()` call with `fetch('/api/recommend')`.
4. The frontend UI, rank cards, score badges, and note tags will render identically.

---

## 📄 License & Ownership

Designed and built for demonstration and sales pitching purposes. All brand names, trade dress references, and fragrance inspirations belong to their respective trademark holders.
