/**
 * Optional per-product pitch shown inside a live duel (and the product
 * page) so voters can understand what each side offers without leaving
 * The Arena. All fields are optional — a product that hasn't filled any of
 * them in renders nothing here, and the card's existing description/pitch
 * (rendered by the caller, e.g. SideCard) is the fallback. Never invents
 * copy for a product that didn't provide it.
 */
export function BattlePitch({
  battlePitch,
  whyUs,
  differentiators,
}: {
  battlePitch: string | null;
  whyUs: string | null;
  differentiators: string[];
}) {
  const hasContent = Boolean(battlePitch || whyUs || differentiators.length > 0);
  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-accent/20 bg-accent-soft/5 p-3">
      <span className="text-[10px] font-bold uppercase tracking-wide text-accent">Battle Pitch</span>
      {battlePitch && <p className="text-sm font-medium leading-snug text-ink">{battlePitch}</p>}
      {whyUs && (
        <p className="text-xs leading-snug text-muted">
          <span className="font-semibold text-ink">Why us: </span>
          {whyUs}
        </p>
      )}
      {differentiators.length > 0 && (
        <ul className="flex flex-col gap-1">
          {differentiators.map((d, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs leading-snug text-muted">
              <span className="mt-0.5 shrink-0 text-accent">•</span>
              <span className="break-words">{d}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
