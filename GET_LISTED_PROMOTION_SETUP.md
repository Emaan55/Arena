# Get Listed promotion campaign setup

## Required deployment order

1. Run `supabase/migrations/0027_get_listed_promotion_campaigns.sql` in the Supabase SQL editor.
2. Run `supabase/migrations/0029_campaign_results.sql` after migration 0028 to enable public campaign results.
3. Deploy the application code.
4. Confirm the existing LemonSqueezy webhook still points to `/api/webhooks/lemonsqueezy` and includes order created and order refunded events.

The migration must run before the redesigned campaign form is used. It adds the new package keys, campaign snapshots, and the private deliverable checklist used by the customer and admin dashboards. Existing campaigns, orders, discounts, submissions, and fulfillment history are preserved.

## LemonSqueezy variants

For the clearest checkout labels, create three one-time variants in the existing LemonSqueezy store:

| Campaign | Catalog price | Vercel environment variable |
| --- | ---: | --- |
| Launch Starter | $49 | `LEMONSQUEEZY_GETLISTED_LAUNCH_STARTER_VARIANT_ID` |
| Growth Campaign | $120 | `LEMONSQUEEZY_GETLISTED_GROWTH_CAMPAIGN_VARIANT_ID` |
| Launch Accelerator | $199 | `LEMONSQUEEZY_GETLISTED_LAUNCH_ACCELERATOR_VARIANT_ID` |

Add the variant IDs in Vercel for Production, Preview, and Development as needed, then redeploy.

These variables are recommended rather than mandatory. If one is absent, the checkout code falls back to the corresponding existing Starter, Growth, or Scale variant. The server still supplies the correct package or discounted amount through LemonSqueezy `custom_price`; the dedicated variants mainly ensure the checkout product name matches the new campaign.

Do not remove the three legacy variant environment variables. Pending historical campaigns continue to use them.

## Live campaign reporting workflow

After LemonSqueezy confirms payment, the campaign appears in **My Arena → Promotion campaigns** with its package, status, fulfillment percentage, directory progress, and available performance totals.

1. Open **Admin → Get Listed → Campaigns** and select the paid campaign.
2. Change a deliverable to **In progress** when work begins. The campaign automatically moves from Active to In progress.
3. Add the published URL, downloadable asset URL, and a customer update.
4. Enter the metrics the platform actually reports, such as views, impressions, link clicks, reactions, comments, shares, or watch time.
5. Mark the deliverable complete only after adding evidence.
6. Use **Preview report** to see the same report as the customer.

The customer report refreshes every 30 seconds while the page is visible and can also be refreshed manually. It shows results by individual platform and never exposes internal admin notes. Fulfillment editing is disabled until payment is confirmed.

This reporting update uses the `campaign_deliverables.metrics` JSON field from migration `0027`; it does not require another database migration or another paid service.

## Public campaign results workflow

Migration `0029_campaign_results.sql` adds a separate, curated public results layer. It does not modify orders, payments, discounts, fulfillment status, or the private customer report.

1. Open **Admin → Get Listed → Campaign Results**.
2. Select an existing campaign.
3. Add the product logo, optional Ahrefs DR evidence, and only the YouTube, LinkedIn, or X posts that were actually published.
4. Save a draft and verify the public card preview.
5. Publish the result when its links and manually recorded metrics are ready.
6. Update the same result as platform view counts change, or use **Unpublish** to remove it from the Get Listed page without deleting campaign history.

The public section remains hidden until at least one result is published. Platform links are validated on the server, combined views sum only saved view counts, and the RLS policies expose only published result rows.

## Verification checklist

- Create an unpaid campaign for each new package and confirm its base amount.
- Open a direct full-price checkout without playing Discount Drop.
- Claim a Discount Drop award and confirm the server-calculated discounted amount.
- Complete a LemonSqueezy test payment and confirm the webhook changes the order to paid and campaign to active.
- Confirm the discount becomes redeemed only after the paid webhook.
- Open the campaign in the admin panel and update a deliverable with evidence links and available metrics.
- Confirm the customer campaign page displays only customer-safe notes, links, and metrics.
- Confirm an old Starter, Growth, or Scale campaign still shows its original package and charged amount.

