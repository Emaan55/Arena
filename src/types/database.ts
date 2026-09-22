export const CATEGORIES = [
  "General",
  "AI Tools",
  "Dev Tools",
  "Design",
  "Marketing",
  "Productivity",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type ProductStatus = "active" | "eliminated" | "champion" | "unique";
export type MatchStatus = "active" | "resolved";
export type VoteSide = "a" | "b";
export type PaymentType = "boost" | "revive" | "defend" | "sponsor";
export type PaymentStatus = "pending" | "completed" | "failed";
export type SponsorshipStatus = "queued" | "active" | "completed" | "cancelled";
export type LogoStatus = "pending" | "success" | "temporary_failure" | "not_found";

export type CampaignStatus = "draft" | "awaiting_payment" | "active" | "in_progress" | "completed" | "cancelled";
export type SubmissionStatus = "pending" | "submitted" | "accepted" | "rejected";
export type GameValidationStatus = "pending" | "valid" | "suspicious" | "rejected";
export type DiscountAwardStatus = "available" | "redeemed" | "expired" | "cancelled";

// These are `type` (not `interface`) deliberately: interfaces don't satisfy
// the `Record<string, unknown>` structural constraint that supabase-js's
// generic Database typing relies on for Row/Insert/Update, which silently
// collapses every query builder call to `never`.
export type Product = {
  id: string;
  name: string;
  url: string;
  pitch: string;
  category: Category;
  status: ProductStatus;
  wins: number;
  is_defending: boolean;
  submitted_at: string;
  pool_entered_at: string;
  uncontested_wins: number;
  // Battle Pitch — all optional, all fall back to `pitch` in the UI when
  // absent so pre-existing products keep working unchanged.
  battle_pitch: string | null;
  why_us: string | null;
  differentiators: string[];
  // Optional founder attribution — normalized, no leading '@', no X API
  // integration. Null means "not supplied," never inferred.
  x_handle: string | null;
  // Hash of a one-time edit token handed to the submitter at creation.
  // Never sent to the client after that — only compared server-side.
  edit_token_hash: string | null;
  // Auto-discovered via the multi-strategy pipeline in
  // lib/favicon-service.ts — never a manual upload. `logo_url` is a stable
  // copy in our own storage once `logo_status` is "success"; ProductAvatar
  // falls back to the product's initial whenever it's null, so a pending/
  // failed lookup is never user-visible as broken.
  logo_url: string | null;
  // "pending" (never resolved, or queued for retry) / "success" /
  // "temporary_failure" (network blip, 5xx, rate-limited — retried) /
  // "not_found" (every strategy came back clean-negative — still retried,
  // since a founder may add a favicon after submitting). Never a
  // permanent-failure sentinel: see backfillMissingProductFavicons.
  logo_status: LogoStatus;
  logo_checked_at: string | null;
  // Backoff-scheduled retry eligibility — see lib/arena.ts's
  // backfillMissingProductFavicons for the schedule.
  logo_next_attempt_at: string;
  logo_attempts: number;
  // Which discovery strategy actually succeeded (e.g. "link[rel=icon]") —
  // diagnostic only, shown in /admin/favicon-diagnostic.
  logo_source: string | null;
};

export type Match = {
  id: string;
  category: Category;
  product_a_id: string;
  product_b_id: string;
  votes_a: number;
  votes_b: number;
  status: MatchStatus;
  created_at: string;
  resolved_at: string | null;
};

export type Vote = {
  id: string;
  match_id: string;
  // Exactly one of these two is set — see migration 0014's
  // votes_identity_check constraint. Historical rows are all
  // voter_fingerprint (anonymous); user_id is the newer, authenticated path.
  voter_fingerprint: string | null;
  user_id: string | null;
  side: VoteSide;
  created_at: string;
};

export type Champion = {
  id: string;
  product_id: string;
  category: Category;
  crowned_at: string;
  times_defended: number;
};

export type ProductSearchResult = Pick<
  Product,
  "id" | "name" | "category" | "pitch" | "battle_pitch" | "status" | "wins" | "x_handle" | "logo_url"
>;

export type ActivityLogEntry = {
  id: string;
  text: string;
  created_at: string;
};

export type Payment = {
  id: string;
  lemonsqueezy_order_id: string | null;
  product_id: string | null;
  match_id: string | null;
  type: PaymentType;
  amount: number | null;
  status: PaymentStatus;
  created_at: string;
};

// One product is ever "active" (the DB enforces this with a partial unique
// index — see supabase/migrations/0007_sponsorships.sql); everyone else
// who's paid (or been granted a free slot by the founder) sits `queued`,
// ordered by `position`, and is promoted automatically the moment the
// active slot's `ends_at` passes. See src/lib/sponsorship.ts.
export type Sponsorship = {
  id: string;
  // Null for an external sponsorship (is_external = true) — an arbitrary
  // URL that never gets added to the Arena as a product.
  product_id: string | null;
  status: SponsorshipStatus;
  duration_days: number;
  is_free: boolean;
  amount: number | null;
  lemonsqueezy_order_id: string | null;
  position: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  is_external: boolean;
  external_name: string | null;
  external_url: string | null;
  external_category: string | null;
  external_description: string | null;
  // Favicon resolved once (site's own /favicon.ico, else a public favicon
  // service) at checkout/creation time and stored here — see
  // lib/url-metadata.ts — so it's never re-fetched on every page view.
  logo_url: string | null;
  // Optional, normalized (no leading '@') — same convention as
  // products.x_handle. Collected for both Arena and external sponsorships.
  founder_x_handle: string | null;
  // Plain display name, distinct from the X handle — only ever set by the
  // admin-only "Add External Product" flow (/admin/sponsorships), never
  // the regular paid checkout.
  founder_name: string | null;
};

// Phase 1 "Get Listed" — see supabase/migrations/0015_get_listed.sql and
// lib/get-listed/packages.ts for the package pricing/target source of truth.
export type Campaign = {
  id: string;
  owner_id: string;
  startup_name: string;
  website_url: string;
  description: string;
  category: string;
  x_url: string | null;
  linkedin_url: string | null;
  other_url: string | null;
  package_key: string;
  submission_target: number;
  status: CampaignStatus;
  terms_accepted_at: string | null;
  created_at: string;
  updated_at: string;
  // Set only if a verified Discount Drop award was attached at creation
  // time — see migration 0016. Null for a full-price campaign.
  discount_award_id: string | null;
  discount_percent: number | null;
};

export type Submission = {
  id: string;
  campaign_id: string;
  directory_name: string;
  directory_url: string | null;
  status: SubmissionStatus;
  listing_url: string | null;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

// Phase 2 "Discount Drop" — see migration 0016 and lib/discount-drop/*.
// `metadata` carries the server-generated challenge schedule/seed used to
// validate a completed attempt (never trusted from the client) — see
// lib/discount-drop/schedule.ts for its shape.
export type GameAttempt = {
  id: string;
  user_id: string;
  score: number | null;
  discount_percent: number | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  validation_status: GameValidationStatus;
  metadata: Record<string, unknown>;
};

export type DiscountAward = {
  id: string;
  user_id: string;
  campaign_id: string | null;
  game_attempt_id: string;
  score: number;
  discount_percent: number;
  status: DiscountAwardStatus;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
};

type Relationships = [];

export interface Database {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: Partial<Product>;
        Update: Partial<Product>;
        Relationships: Relationships;
      };
      matches: {
        Row: Match;
        Insert: Partial<Match>;
        Update: Partial<Match>;
        Relationships: Relationships;
      };
      votes: {
        Row: Vote;
        Insert: Partial<Vote>;
        Update: Partial<Vote>;
        Relationships: Relationships;
      };
      champions: {
        Row: Champion;
        Insert: Partial<Champion>;
        Update: Partial<Champion>;
        Relationships: Relationships;
      };
      activity_log: {
        Row: ActivityLogEntry;
        Insert: Partial<ActivityLogEntry>;
        Update: Partial<ActivityLogEntry>;
        Relationships: Relationships;
      };
      payments: {
        Row: Payment;
        Insert: Partial<Payment>;
        Update: Partial<Payment>;
        Relationships: Relationships;
      };
      sponsorships: {
        Row: Sponsorship;
        Insert: Partial<Sponsorship>;
        Update: Partial<Sponsorship>;
        Relationships: Relationships;
      };
      campaigns: {
        Row: Campaign;
        Insert: Partial<Campaign>;
        Update: Partial<Campaign>;
        Relationships: Relationships;
      };
      submissions: {
        Row: Submission;
        Insert: Partial<Submission>;
        Update: Partial<Submission>;
        Relationships: Relationships;
      };
      game_attempts: {
        Row: GameAttempt;
        Insert: Partial<GameAttempt>;
        Update: Partial<GameAttempt>;
        Relationships: Relationships;
      };
      discount_awards: {
        Row: DiscountAward;
        Insert: Partial<DiscountAward>;
        Update: Partial<DiscountAward>;
        Relationships: Relationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      cast_vote: {
        Args: { p_match_id: string; p_fingerprint: string; p_side: VoteSide };
        Returns: Match;
      };
      boost_votes: {
        Args: { p_match_id: string; p_side: VoteSide; p_amount: number };
        Returns: Match;
      };
      bump_abuse_window: {
        Args: { p_ip_hash: string; p_event_type: string; p_window_seconds: number };
        Returns: number;
      };
      record_recent_match_and_count: {
        Args: { p_ip_hash: string; p_match_id: string; p_window_seconds: number };
        Returns: number;
      };
      cast_vote_authenticated: {
        Args: { p_match_id: string; p_user_id: string; p_side: VoteSide };
        Returns: Match;
      };
    };
  };
}
