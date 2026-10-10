"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Bell, Box, ChevronDown, LayoutDashboard, LogOut, Settings } from "lucide-react";

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeImageUrl(value: unknown) {
  const candidate = stringValue(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getProfile(user: User) {
  const metadata = user.user_metadata ?? {};
  const identityMetadata = user.identities?.map((identity) => identity.identity_data ?? {}) ?? [];
  const name = stringValue(metadata.full_name) || stringValue(metadata.name) || stringValue(metadata.display_name) || stringValue(metadata.preferred_username) || user.email?.split("@")[0] || "Founder";
  const username = stringValue(metadata.user_name) || stringValue(metadata.preferred_username) || stringValue(metadata.username);
  const imageCandidates = [
    metadata.avatar_url,
    metadata.picture,
    metadata.profile_image_url,
    ...identityMetadata.flatMap((identity) => [identity.avatar_url, identity.picture, identity.profile_image_url]),
  ];
  const avatarUrl = imageCandidates.map(safeImageUrl).find(Boolean) ?? null;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "F";
  return { name, username, avatarUrl, initials };
}

function ProfileAvatar({ name, initials, avatarUrl, size = "md" }: { name: string; initials: string; avatarUrl: string | null; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-gradient-to-br from-accent to-blue-600 font-display font-black text-white shadow-sm ${sizeClass}`}>
      {avatarUrl && !failed ? (
        // OAuth avatars are remote user-provided URLs and cannot use next/image without a fixed host allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={`${name} profile`} className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : initials}
    </span>
  );
}

export function UserProfileMenu({ user, onSignOut }: { user: User; onSignOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [storedAvatarUrl, setStoredAvatarUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const profile = useMemo(() => getProfile(user), [user]);

  useEffect(() => {
    if (profile.avatarUrl) return;
    let active = true;
    fetch("/api/profile/avatar", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const avatar = safeImageUrl(data?.avatarUrl);
        if (active && avatar) setStoredAvatarUrl(avatar);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [profile.avatarUrl]);

  const avatarUrl = profile.avatarUrl ?? storedAvatarUrl;

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await onSignOut();
      setOpen(false);
    } finally {
      setSigningOut(false);
    }
  }

  const links = [
    { href: "/dashboard", label: "My Arena", icon: LayoutDashboard },
    { href: "/dashboard#products", label: "My Products", icon: Box },
    { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={open} className="flex h-10 items-center gap-1 rounded-full pl-0.5 pr-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink">
        <ProfileAvatar key={avatarUrl ?? "fallback"} name={profile.name} initials={profile.initials} avatarUrl={avatarUrl} size="sm" />
        <ChevronDown className={`hidden h-3.5 w-3.5 transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-12 z-[80] w-[min(88vw,270px)] overflow-hidden rounded-2xl border border-border bg-bg shadow-lg">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <ProfileAvatar key={`large-${avatarUrl ?? "fallback"}`} name={profile.name} initials={profile.initials} avatarUrl={avatarUrl} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{profile.name}</p>
              <p className="truncate text-xs text-muted">{profile.username ? `@${profile.username.replace(/^@/, "")}` : user.email}</p>
            </div>
          </div>
          <div className="p-2">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink">
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </div>
          <div className="border-t border-border p-2">
            <button type="button" role="menuitem" disabled={signingOut} onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50">
              <LogOut className="h-4 w-4" />{signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

