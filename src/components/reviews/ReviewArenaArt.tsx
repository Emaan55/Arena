import { BrandLogo } from "@/components/BrandLogo";

export function ReviewArenaArt() {
  return <div className="review-arena-art" aria-hidden="true">
    <div className="review-arena-backdrop" />
    <span className="review-doodle review-doodle-left">↗</span>
    <span className="review-doodle review-doodle-right">ϟ</span>
    <span className="review-heart">♥</span>
    <div className="review-seat review-seat-one"><span /><span /><span /></div>
    <div className="review-seat review-seat-two"><span /><span /><span /></div>
    <div className="review-seat review-seat-three"><span /><span /><span /></div>
    <div className="review-seat review-seat-four"><span /><span /><span /></div>
    <div className="review-story-note">YOUR<br />REVIEW<br />HERE?<span>♛</span></div>
    <svg viewBox="0 0 620 230" className="review-podium" fill="none">
      <path d="M48 104 310 26 572 104 520 200 100 200Z" fill="#20323f" stroke="#4d6575" />
      <path d="M48 104 310 53 572 104 520 142 100 142Z" fill="#354b5c" stroke="var(--accent)" strokeOpacity=".5" />
      <path d="m100 142 210-44 210 44v58H100Z" fill="#20323f" stroke="#4d6575" />
      <path d="M252 110h116l28 90H224Z" fill="#07111b" stroke="var(--accent)" strokeWidth="2" />
      <path d="m310 120-41 65h23l18-30 18 30h23l-41-65Z" fill="#00B4D8" />
      <path d="M159 83v57m45-72v62m212-62v62m45-47v57M100 162l124 6m172 0 124-6M100 184h128m165 0h127" stroke="#637d8f" />
      <path d="M86 211h448" stroke="#90E0EF" strokeWidth="3" />
    </svg>
    <div className="review-art-brand"><BrandLogo variant="icon" className="h-5 w-5" /><span>THE FOUNDER WALL</span></div>
  </div>;
}
