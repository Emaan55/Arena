# Get Listed promotion campaign setup

## Required deployment order

1. Run `supabase/migrations/0027_get_listed_promotion_campaigns.sql` in the Supabase SQL editor.
2. Deploy the application code.
3. Confirm the existing LemonSqueezy webhook still points to `/api/webhooks/lemonsqueezy` and includes order created and order refunded events.

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

## Verification checklist

- Create an unpaid campaign for each new package and confirm its base amount.
- Open a direct full-price checkout without playing Discount Drop.
- Claim a Discount Drop award and confirm the server-calculated discounted amount.
- Complete a LemonSqueezy test payment and confirm the webhook changes the order to paid and campaign to active.
- Confirm the discount becomes redeemed only after the paid webhook.
- Open the campaign in the admin panel and update a deliverable with evidence links and available metrics.
- Confirm the customer campaign page displays only customer-safe notes, links, and metrics.
- Confirm an old Starter, Growth, or Scale campaign still shows its original package and charged amount.


