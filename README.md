# JENET — 3D Ecommerce Website

Immersive customer storefront + owner dashboard, built for Netlify.

## Included
- 3D animated responsive storefront
- Product catalogue, categories, details, stock and cart
- Customer checkout and persistent orders
- Reviews and ratings
- Owner dashboard for add/edit/remove products and order viewing
- Direct owner product-image uploads using Netlify Blobs
- PDF invoice generation, download and supported-device sharing
- COD + Stripe/Razorpay/PayPal-ready payment selection
- Privacy, terms, shipping and returns templates
- Netlify Database + Functions + Blobs architecture

## Netlify setup
A Netlify project named `jenet-3d-store` has been created. Connect this GitHub repository to that project in Netlify's dashboard, then deploy from `main`.

Build settings are already in `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `dist`
- Functions: `netlify/functions`

Add a secret site environment variable:
- `OWNER_KEY` — strong private password for the owner dashboard.

Netlify Database uses the migration in `netlify/database/migrations/0001_init.sql`. Product image uploads use the site-wide `jenet-product-images` Blob store.

## Payments
Optional secret environment variables:
- `STRIPE_SECRET_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`

The UI and order model support these payment choices, but live online charge capture is intentionally not treated as complete until each provider's secure hosted checkout/signature verification/webhooks are connected and tested. COD works as an order-payment selection without gateway credentials.

## Product photos
The GitHub repository did not contain the previously mentioned product photos. The owner dashboard now supports direct image upload after Netlify deploy, so real photos can be added without another code change.

## Policies
The included Privacy, Terms, Shipping and Returns text is a starter template and must be reviewed for the actual business, products, jurisdiction and refund/shipping rules before launch.
