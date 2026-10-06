import { GLOSSARY } from "@/lib/glossary";

export default function Glossary() {
  return (
    <div className="h-full min-h-0 overflow-auto scroll-hint">
    <div className="mx-auto grid max-w-[860px] gap-3 pb-2">
      <nav aria-label="Terms" className="flex flex-wrap gap-1.5">
        {GLOSSARY.map((t) => <a key={t.id} href={`#${t.id}`} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] text-ink-2 hover:bg-surface-2">{t.term}</a>)}
      </nav>
      {GLOSSARY.map((t) => (
        <section key={t.id} id={t.id} className="scroll-mt-4 rounded-lg border border-line bg-surface p-3.5 transition-colors target:border-accent target:bg-accent-soft motion-reduce:transition-none">
          <h2 className="font-display text-base font-bold">{t.term}</h2>
          <p className="mt-1 text-[13.5px] text-ink">{t.plain}</p>
          <p className="mt-2 border-t border-line pt-2 text-[12.5px] text-ink-2"><b className="text-muted">Technical: </b>{t.technical}</p>
        </section>
      ))}
    </div>
    </div>
  );
}
