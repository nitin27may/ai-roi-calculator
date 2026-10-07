import { groupedGlossary } from "@/lib/glossary";

export default function Glossary() {
  const groups = groupedGlossary();
  return (
    <div className="h-full min-h-0 overflow-auto scroll-hint">
    <div className="mx-auto grid max-w-[860px] gap-3 pb-2">
      <nav aria-label="Terms" className="grid gap-2">
        {groups.map(({ group, terms }) => (
          <div key={group} className="flex flex-wrap items-center gap-1.5">
            <span className="w-full text-xs font-semibold uppercase tracking-wide text-muted sm:w-auto sm:min-w-36">{group}</span>
            {terms.map((t) => <a key={t.id} href={`#${t.id}`} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] text-ink-2 hover:bg-surface-2">{t.term}</a>)}
          </div>
        ))}
      </nav>
      {groups.map(({ group, terms }) => (
        <div key={group} className="grid gap-3">
          <h2 className="mt-2 font-display text-[13px] font-bold uppercase tracking-wide text-muted">{group}</h2>
          {terms.map((t) => (
            <section key={t.id} id={t.id} className="scroll-mt-4 rounded-lg border border-line bg-surface p-3.5 transition-colors target:border-accent target:bg-accent-soft motion-reduce:transition-none">
              <h3 className="font-display text-base font-bold">{t.term}</h3>
              <p className="mt-1 text-[13.5px] text-ink">{t.plain}</p>
              <p className="mt-2 border-t border-line pt-2 text-[12.5px] text-ink-2"><b className="text-muted">Technical: </b>{t.technical}</p>
            </section>
          ))}
        </div>
      ))}
    </div>
    </div>
  );
}
