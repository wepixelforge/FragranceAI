const STEPS = [
  {
    label: 'Discover',
    title: '1.5 ml discovery sizes',
    body: 'Small vials and discovery sets for trying a scent before you spend more.',
  },
  {
    label: 'Try',
    title: '5 / 10 / 20 ml decants',
    body: 'Travel-friendly decants when you want more wears without a full bottle.',
  },
  {
    label: 'Commit',
    title: 'Full bottles',
    body: 'Retail bottles when you already know the fragrance.',
  },
];

export default function ScentiraFormatsSection() {
  return (
    <section className="border-t border-brand-border bg-brand-bg py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">How you can shop</p>
        <h2 className="mt-3 font-serif text-2xl text-brand-text sm:text-3xl">
          Start small. Buy the bottle when you are sure.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-brand-text-muted">
          Not every fragrance is available in every size. This is the usual path — discovery size, decant, then full bottle.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.label} className="border border-brand-border bg-brand-surface p-6">
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-accent">{step.label}</p>
              <h3 className="mt-3 font-serif text-xl text-brand-text">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
