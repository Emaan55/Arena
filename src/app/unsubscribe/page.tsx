import Link from "next/link";
import { UnsubscribeForm } from "@/components/UnsubscribeForm";
export default async function UnsubscribePage({searchParams}:{searchParams:Promise<{token?:string}>}){const {token=""}=await searchParams;return <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-6 py-16"><h1 className="font-display text-3xl font-black text-ink">Email preferences</h1><UnsubscribeForm token={token}/><Link href="/" className="text-sm text-accent hover:underline">Back to The Arena</Link></main>}
