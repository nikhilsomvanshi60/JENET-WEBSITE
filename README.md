# JENET — 3D Ecommerce Website

Immersive customer storefront + owner dashboard, built for Netlify.

## Included
- 3D animated storefront with responsive premium UI
- Product catalogue, categories, detail view, stock and cart
- Checkout and order storage
- Reviews and ratings
- Owner dashboard to add, edit and remove products and view orders
- PDF invoice generation, download and supported-device sharing
- Payment method selector for COD, Stripe, Razorpay and PayPal
- Netlify Database + Netlify Functions architecture

## Netlify setup
1. Connect this GitHub repository to Netlify.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add a secret environment variable named `OWNER_KEY` with a strong private value.
5. Netlify Database is provisioned from the migration in `netlify/database/migrations` when supported/enabled for the site.

Optional payment credentials can be stored as Netlify environment variables:
- `STRIPE_SECRET_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`

The storefront intentionally does **not** hard-code payment secrets. The current checkout records online-payment orders but live charge capture must be connected to each provider's verified checkout/webhook flow before accepting real online payments.

## Product photos
The repository did not contain the previously mentioned product photos. Use the Owner dashboard to add real image URLs, or add image upload/storage in a future iteration.

## Owner access
The owner dashboard is opened from the diamond icon in the top navigation. It validates the key server-side against `OWNER_KEY`.

## Development
`npm install` then use Netlify's local tooling for Functions/Database development.
