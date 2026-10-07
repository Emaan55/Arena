import type { Metadata } from "next";
import { getArenaReviews } from "@/lib/arena-reviews";
import { ReviewWall } from "@/components/reviews/ReviewWall";
import "./reviews.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Founder Reviews | THE ARENA",
  description: "Real founder experiences of competing, discovering products, and building in The Arena. Read the wall and share your experience.",
  alternates: { canonical: "/reviews" },
};
export default async function ReviewsPage({ searchParams }: {
  searchParams: Promise<{ add?: string }>;
}) {
  const [feed, params] = await Promise.all([getArenaReviews(), searchParams]);
  return <ReviewWall initialFeed={feed} openOnArrival={params.add === "1"} />;
}
