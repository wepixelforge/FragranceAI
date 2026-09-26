import Link from 'next/link';

const PUBLIC_PATH = '/SouqScent';

const OCCASIONS = [
  {
    title: 'Office / Work',
    body: 'Keep it clean and wearable. Fresh, aromatic and soft woods that last a workday without filling the room.',
    href: `${PUBLIC_PATH}/shop?family=fresh`,
  },
  {
    title: 'Wedding',
    body: 'Soft orientals, oud and richer blends built for long hours, heat and celebration.',
    href: `${PUBLIC_PATH}/shop?family=oriental`,
  },
  {
    title: 'Date Night',
    body: 'Warmer and a little deeper — something that leaves a trail when you lean in.',
    href: `${PUBLIC_PATH}/shop?family=sweet`,
  },
  {
    title: 'Everyday',
    body: 'Nothing to prove. Fresh musks, easy woods and daily Arabic wear.',
    href: `${PUBLIC_PATH}/shop`,
  },
];

export default function SouqScentOccasions() {
  return (
    <section className="border-t border-brand-border bg-brand-bg py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">Shop by moment</p>
        <h2 className="mt-3 font-serif text-2xl text-brand-text sm:text-3xl">Start from the occasion, not the notes.</h2>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OCCASIONS.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="border border-brand-border bg-brand-surface p-5 transition-colors hover:border-brand-accent/50"
            >
              <h3 className="font-serif text-lg text-brand-text">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-text-muted">{item.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
