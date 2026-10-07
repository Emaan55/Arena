import { BrandLogo } from "./BrandLogo";

export function ArenaLoader({ splash = false }: { splash?: boolean }) {
  return (
    <div className={`arena-loader ${splash ? "arena-loader-splash" : "arena-loader-page"}`} role="status" aria-live="polite" aria-label="Loading The Arena">
      <div className="arena-loader-art" aria-hidden="true">
        <span className="arena-loader-orbit arena-loader-orbit-outer" />
        <span className="arena-loader-orbit arena-loader-orbit-inner" />
        <span className="arena-loader-corner arena-loader-corner-one" />
        <span className="arena-loader-corner arena-loader-corner-two" />
        <div className="arena-loader-mark"><BrandLogo variant="icon" className="h-20 w-20" /></div>
      </div>
      <div className="arena-loader-copy" aria-hidden="true">
        <span className="arena-loader-eyebrow">ENTERING THE ARENA</span>
        <p className="arena-loader-title">Your next move awaits.</p>
        <p className="arena-loader-subtitle">Getting everything ready for you.</p>
      </div>
      <div className="arena-loader-bars" aria-hidden="true"><span /><span /><span /><span /></div>
      <span className="sr-only">Loading the page. Please wait.</span>
    </div>
  );
}
