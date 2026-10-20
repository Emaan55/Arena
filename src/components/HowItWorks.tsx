import { Rocket, Swords, Users, Crown, Trophy } from "lucide-react";

const STEPS = [
  { icon: Rocket, title: "Submit Your Product", body: "Pay $1, or earn a free submission by voting and reviewing." },
  { icon: Swords, title: "Fight in Duels", body: "You'll be matched randomly with another product." },
  { icon: Users, title: "Get Votes", body: "Rally the crowd. First to 100 votes wins the duel." },
  { icon: Crown, title: "Win 3 in a Row", body: "Achieve 3 consecutive wins to become champion." },
  { icon: Trophy, title: "Live Forever", body: "Your name is added to the Hall of Fame." },
];

export function HowItWorks() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex items-start gap-3 lg:flex-col lg:items-center lg:text-center">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-accent">
            <step.icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">
              Step {i + 1}
            </span>
            <h3 className="font-display text-sm font-bold text-ink">{step.title}</h3>
            <p className="text-xs leading-relaxed text-muted">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
