const STEPS = [
  { n: '01', t: 'Browse the collection' },
  { n: '02', t: 'Choose a sample or smaller size' },
  { n: '03', t: 'Wear it in real life' },
  { n: '04', t: 'Decide if it is yours' },
  { n: '05', t: 'Come back for the full bottle' },
];

export default function ScentStoriesHowItWorks() {
  return (
    <section className="border-t border-brand-border py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">How it works</p>
        <h2 className="mt-3 font-serif text-3xl text-brand-text">Try first. Buy when you are sure.</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-5">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="text-[10px] tracking-[0.22em] text-brand-accent">{step.n}</span>
              <p className="mt-2 font-serif text-lg text-brand-text leading-snug">{step.t}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
