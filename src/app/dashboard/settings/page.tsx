"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type PreferenceKey = "important_duel_updates" | "review_notifications" | "daily_vote_digest" | "product_announcements" | "get_listed_updates";
type Preferences = Record<PreferenceKey, boolean>;
const OPTIONS: { key: PreferenceKey; title: string; description: string }[] = [
  { key: "important_duel_updates", title: "Important duel updates", description: "Rival matched, duel results, champion crowns, and occasional waiting reminders." },
  { key: "review_notifications", title: "Product reviews", description: "When a voter leaves a review for your product." },
  { key: "daily_vote_digest", title: "Daily vote digest", description: "One daily summary of votes received by your products. No email after individual votes." },
  { key: "product_announcements", title: "Arena announcements", description: "New features and important product announcements. Off by default." },
  { key: "get_listed_updates", title: "Get Listed updates", description: "Fulfillment milestones for your Get Listed campaigns." },
];
export default function NotificationSettingsPage() {
 const [preferences,setPreferences]=useState<Preferences|null>(null); const [message,setMessage]=useState(""); const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/notifications/preferences").then(async r=>{const d=await r.json(); if(!r.ok) throw new Error(d.error); setPreferences(d.preferences);}).catch(e=>setError(e.message));},[]);
 async function change(key:PreferenceKey,value:boolean){if(!preferences)return; const prior=preferences; setPreferences({...prior,[key]:value}); setMessage(""); setError(""); const r=await fetch("/api/notifications/preferences",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({[key]:value})}); const d=await r.json(); if(!r.ok){setPreferences(prior);setError(d.error??"Could not save preferences.");}else{setPreferences(d.preferences);setMessage("Preferences saved.");}}
 return <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12"><Link href="/dashboard" className="text-sm text-muted hover:text-accent">← My Arena</Link><div><h1 className="font-display text-3xl font-black text-ink">Notification settings</h1><p className="mt-1 text-sm text-muted">In-app notifications stay on. Choose which optional emails you receive.</p></div>{error&&<p className="text-sm text-danger">{error}{error.includes("Sign in")&&<Link href="/auth/sign-in?next=%2Fdashboard%2Fsettings" className="ml-2 underline">Sign in</Link>}</p>}{message&&<p role="status" className="text-sm text-accent">{message}</p>}<section className="divide-y divide-border rounded-2xl border border-border bg-surface px-5">{OPTIONS.map(option=><label key={option.key} className="flex cursor-pointer items-center justify-between gap-4 py-5"><span><strong className="block text-sm text-ink">{option.title}</strong><span className="mt-1 block text-xs text-muted">{option.description}</span></span><input type="checkbox" checked={preferences?.[option.key]??false} disabled={!preferences} onChange={e=>void change(option.key,e.target.checked)} className="h-4 w-4 accent-[#00b4d8]"/></label>)}</section><p className="text-xs text-muted">Essential product-submission and claim decision emails remain enabled. Each optional email also has an unsubscribe link.</p></main>;
}
