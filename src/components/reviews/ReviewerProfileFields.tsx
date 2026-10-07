"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ExternalLink } from "lucide-react";
import { normalizeReviewerSocial, reviewerAvatarSources, REVIEW_PHOTO_MAX_BYTES, REVIEW_SOCIAL_PLATFORMS, type ReviewSocialPlatform } from "@/lib/arena-review-validation";
import { ReviewAvatar } from "./ReviewCard";

export function ReviewerProfileFields({ name, avatarUrl, disabled }: { name: string; avatarUrl: string | null; disabled: boolean }) {
  const [displayName, setDisplayName] = useState(name);
  const [platform, setPlatform] = useState<ReviewSocialPlatform | "">("x");
  const [profile, setProfile] = useState("");
  const [photoProfile, setPhotoProfile] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const objectUrl = useRef<string | null>(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const social = normalizeReviewerSocial(platform, profile);
  const photoSocial = normalizeReviewerSocial(platform, photoProfile);
  const sources = photoSocial.value ? reviewerAvatarSources({ ...photoSocial.value, avatar_url: avatarUrl }) : avatarUrl ? [avatarUrl] : [];
  if (photoUrl) sources.unshift(photoUrl);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setPhotoUrl(null);
    setPhotoError("");
    input.setCustomValidity("");
    if (!file) return;
    if (file.size > REVIEW_PHOTO_MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      const message = "Choose a JPG, PNG, or WebP photo smaller than 2 MB.";
      input.setCustomValidity(message);
      setPhotoError(message);
      return;
    }
    objectUrl.current = URL.createObjectURL(file);
    setPhotoUrl(objectUrl.current);
  }

  return <fieldset className="review-profile-fields" disabled={disabled}>
    <legend>Your public reviewer profile</legend>
    <div className="review-profile-preview"><ReviewAvatar name={displayName || "Your name"} url={sources[0] ?? null} fallbackUrls={sources.slice(1)} /><div><strong>{displayName || "Your name"}</strong><span>{social.value?.social_url ? <a href={social.value.social_url} target="_blank" rel="noopener noreferrer nofollow ugc">{platform === "x" || platform === "instagram" ? `@${social.value.social_handle}` : "Your public profile"}<ExternalLink size={11} aria-hidden="true" /></a> : "How you will appear on the review wall"}</span></div></div>
    <label>Your name <span className="text-muted">(required)</span><input name="displayName" required maxLength={100} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your public display name" /></label>
    <div className="review-form-fields"><label>Social platform <span className="text-muted">(optional)</span><select name="socialPlatform" value={platform} onChange={(event) => { setPlatform(event.target.value as ReviewSocialPlatform | ""); setProfile(""); setPhotoProfile(""); }}><option value="">No social profile</option>{REVIEW_SOCIAL_PLATFORMS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{platform && <label>{platform === "x" ? "X handle or profile link" : platform === "instagram" ? "Instagram handle or profile link" : platform === "linkedin" ? "LinkedIn profile link" : "Your profile link"}<input name="socialProfile" type={platform === "other" ? "url" : "text"} maxLength={500} value={profile} onChange={(event) => setProfile(event.target.value)} onBlur={() => setPhotoProfile(profile)} placeholder={platform === "x" ? "@yourhandle" : platform === "instagram" ? "@yourhandle" : platform === "linkedin" ? "https://linkedin.com/in/yourname" : "https://your-profile.com/you"} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>}</div>
    <p className="review-profile-help">Add a public profile so other builders can find you. X, Instagram, and LinkedIn photos load automatically when available.</p>
    <label className="review-photo-label"><span><Camera size={15} aria-hidden="true" /> Your photo <span className="text-muted">(optional)</span></span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} aria-describedby="review-photo-help" /></label>
    <p id="review-photo-help" className="review-profile-help">Upload your photo if your social photo does not load. JPG, PNG, or WebP up to 2 MB. Otherwise, we use your account photo or initials.</p>
    {photoError && <p className="review-error" role="alert">{photoError}</p>}
  </fieldset>;
}
