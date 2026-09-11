import { xProfileUrl } from "@/lib/x-handle";

/**
 * "Built by @handle", linking out to the founder's X profile. Renders
 * nothing when no handle was supplied — never implies a founder
 * relationship that wasn't actually provided. Always a sibling link, never
 * nested inside another <a> (some callers, e.g. Leaderboard rows, wrap the
 * whole card in a Link — this component is intentionally not used there).
 */
export function XHandleLink({ handle, className }: { handle: string | null; className?: string }) {
  if (!handle) return null;

  return (
    <a
      href={xProfileUrl(handle)}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className={
        className ??
        "inline-flex w-fit items-center gap-1 text-xs text-muted transition-colors duration-150 ease-out hover:text-accent"
      }
    >
      Built by @{handle}
    </a>
  );
}
