import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Swords, LogIn, Star, Plus, Megaphone, Crown, ShieldCheck, Shield, XCircle, Clock, RotateCcw, Zap } from "lucide-react";
import { timeAgo } from "@/lib/format";

interface ActivityMeta {
  Icon: LucideIcon;
  label: string;
  badge: string;
  node: ReactNode;
}

function bold(name: string): ReactNode {
  return <strong className="font-semibold text-ink">{name}</strong>;
}

/**
 * `activity_log.text` is a single pre-formatted string (see the
 * `logActivity` calls in lib/arena.ts / lib/sponsorship.ts /
 * api/products/route.ts) — there's no structured type/category column.
 * Rather than touching that write path (and the DB), this matches each of
 * those exact, known message shapes to recover an icon/label/badge and
 * bold the product name(s) for display. Falls through to a plain render
 * for anything unrecognized, so a future message shape never breaks the
 * feed — it just won't get a tailored icon yet.
 */
function parseActivity(raw: string): ActivityMeta {
  let m: RegExpMatchArray | null;

  if ((m = raw.match(/^⚔️ New duel in (.+): (.+) vs (.+)$/))) {
    return { Icon: Swords, label: "New Duel", badge: "DUEL", node: <>{bold(m[2])} vs {bold(m[3])}</> };
  }
  if ((m = raw.match(/^🆕 (.+?) just entered the arena in (.+)$/))) {
    return {
      Icon: LogIn,
      label: "Entered Arena",
      badge: "ARENA",
      node: <>{bold(m[1])} just entered the arena in {m[2]}</>,
    };
  }
  if ((m = raw.match(/^📣 (.+?) was added as a featured sponsor by the founder$/))) {
    return {
      Icon: Plus,
      label: "Sponsor Added",
      badge: "SPONSOR",
      node: <>{bold(m[1])} was added as a featured sponsor by the founder</>,
    };
  }
  if ((m = raw.match(/^📣 (.+?) is now the featured sponsor$/))) {
    return { Icon: Star, label: "Featured Sponsor", badge: "SPONSOR", node: <>{bold(m[1])} is now the featured sponsor</> };
  }
  if ((m = raw.match(/^📣 (.+?) just booked a sponsorship$/))) {
    return { Icon: Megaphone, label: "New Sponsor", badge: "SPONSOR", node: <>{bold(m[1])} just booked a sponsorship</> };
  }
  if ((m = raw.match(/^🏆 (.+?) has been crowned Champion of (.+?), (.+)!$/))) {
    return {
      Icon: Crown,
      label: "Champion Crowned",
      badge: "CHAMPION",
      node: <>{bold(m[1])} has been crowned Champion of {m[2]}, {m[3]}!</>,
    };
  }
  if ((m = raw.match(/^🛡️ (.+?) has successfully defended the throne in (.+?), (.+)!$/))) {
    return {
      Icon: ShieldCheck,
      label: "Throne Defended",
      badge: "CHAMPION",
      node: <>{bold(m[1])} successfully defended the throne in {m[2]}, {m[3]}!</>,
    };
  }
  if ((m = raw.match(/^🛡️ (.+?) steps back into the arena to defend the throne in (.+)$/))) {
    return {
      Icon: Shield,
      label: "Defending Throne",
      badge: "CHAMPION",
      node: <>{bold(m[1])} steps back into the arena to defend the throne in {m[2]}</>,
    };
  }
  if ((m = raw.match(/^🦄 (.+?) found no challenger in (.+?) after 7 days/))) {
    return {
      Icon: Clock,
      label: "Uncontested",
      badge: "ARENA",
      node: <>{bold(m[1])} found no challenger in {m[2]} after 7 days</>,
    };
  }
  if ((m = raw.match(/^💊 (.+?) has been revived and re-enters the arena in (.+)$/))) {
    return {
      Icon: RotateCcw,
      label: "Revived",
      badge: "ARENA",
      node: <>{bold(m[1])} has been revived and re-enters the arena in {m[2]}</>,
    };
  }
  if ((m = raw.match(/^⚡ (.+?) got boosted \+(\d+) votes in (.+)$/))) {
    return { Icon: Zap, label: "Boosted", badge: "DUEL", node: <>{bold(m[1])} got boosted +{m[2]} votes in {m[3]}</> };
  }
  if ((m = raw.match(/^(.+?) has been eliminated$/))) {
    return { Icon: XCircle, label: "Eliminated", badge: "DUEL", node: <>{bold(m[1])} has been eliminated</> };
  }
  if ((m = raw.match(/^(.+?) beat (.+?) (\d+-\d+) in (.+?) \(win streak: (\d+)\)$/))) {
    return {
      Icon: Swords,
      label: "Duel Won",
      badge: "DUEL",
      node: (
        <>
          {bold(m[1])} beat {bold(m[2])} {m[3]} in {m[4]} (win streak: {m[5]})
        </>
      ),
    };
  }

  return { Icon: Star, label: "Activity", badge: "ARENA", node: <>{raw}</> };
}

export function ActivityFeed({
  activity,
}: {
  activity: { id: string; text: string; created_at: string }[];
}) {
  if (activity.length === 0) {
    return <p className="text-sm text-muted">Nothing has happened yet. Be the first.</p>;
  }

  return (
    <ul className="flex max-h-[28rem] flex-col overflow-y-auto pr-1">
      {activity.map((a, i) => {
        const { Icon, label, badge, node } = parseActivity(a.text);
        const isLast = i === activity.length - 1;
        return (
          <li key={a.id} className="relative flex gap-2.5">
            {/* Timeline rail: a small dot per event, connected by a thin
                line down to the next one. */}
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full border-2 border-accent bg-surface" />
              {!isLast && <span className="w-px flex-1 bg-border" />}
            </div>
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent-soft/15 text-accent">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 rounded-lg px-2 py-1.5 pb-3 transition-colors duration-150 ease-out hover:bg-surface-2">
              <span className="block text-xs font-bold text-ink">{label}</span>
              <p className="mt-0.5 text-xs leading-snug text-muted">{node}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="w-fit rounded-full border border-accent/30 bg-accent-soft/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                  {badge}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">{timeAgo(a.created_at)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
