// How long after submission a product can still be edited. Kept short and
// fixed deliberately: Battle Pitch/Why Us/differentiators/X handle are
// persuasive copy shown inside *live* duels, so an open-ended edit window
// would let a submitter rewrite their pitch mid-battle in response to how
// voting is going. A short, non-negotiable window (checked server-side in
// PATCH /api/products/[id], not just hinted at in the UI) means editing is
// only ever a "finish setting up what I just submitted" action, never a
// way to react to an ongoing vote.
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinEditWindow(submittedAt: string): boolean {
  return Date.now() - new Date(submittedAt).getTime() < EDIT_WINDOW_MS;
}
