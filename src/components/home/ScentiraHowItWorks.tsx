const STEPS = [
  { n: '01', t: 'Browse or describe what you want' },
  { n: '02', t: 'Choose a discovery size, decant, or bottle' },
  { n: '03', t: 'Wear it in real life' },
  { n: '04', t: 'Come back for a larger size if it is yours' },
];

export default function ScentiraHowItWorks() {
  return (
    <section className="border-t border-brand-border bg-brand-bg py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">How it works</p>
        <h2 className="mt-3 font-serif text-2xl text-brand-text sm:text-3xl">Find a scent. Try a size that fits.</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="text-[10px] tracking-[0.22em] text-brand-accent">{step.n}</span>
              <p className="mt-2 font-serif text-lg leading-snug text-brand-text">{step.t}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
