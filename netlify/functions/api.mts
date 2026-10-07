import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

function ownerAllowed(req: Request) {
  const configured = Netlify.env.get("OWNER_KEY");
  if (!configured) return false;
  return req.headers.get("x-owner-key") === configured;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default async (req: Request, _context: Context) => {
  const db = getDatabase();
  const url = new URL(req.url);
  const resource = url.searchParams.get("resource") || "products";

  try {
    if (req.method === "GET" && resource === "image") {
      const key = url.searchParams.get("key") || "";
      if (!key || !key.startsWith("products/")) return new Response("Not found", { status: 404 });
      const store = getStore({ name: "jenet-product-images", consistency: "strong" });
      const entry = await store.getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
      if (!entry?.data) return new Response("Not found", { status: 404 });
      const type = String(entry.metadata?.contentType || "image/jpeg");
      return new Response(entry.data, {
        headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" }
      });
    }

    if (req.method === "GET" && resource === "products") {
      const products = await db.sql`
        SELECT p.*,
          COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS rating,
          COUNT(r.id)::int AS review_count
        FROM products p
        LEFT JOIN reviews r ON r.product_id = p.id AND r.approved = TRUE
        WHERE p.active = TRUE
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `;
      return json({ products });
    }

    if (req.method === "GET" && resource === "reviews") {
      const productId = Number(url.searchParams.get("productId"));
      if (!productId) return json({ reviews: [] });
      const reviews = await db.sql`
        SELECT id, product_id, customer_name, rating, comment, created_at
        FROM reviews
        WHERE product_id = ${productId} AND approved = TRUE
        ORDER BY created_at DESC
      `;
      return json({ reviews });
    }

    if (req.method === "GET" && resource === "orders") {
      if (!ownerAllowed(req)) return json({ error: "Unauthorized" }, 401);
      const orders = await db.sql`
        SELECT * FROM orders ORDER BY created_at DESC LIMIT 100
      `;
      return json({ orders });
    }

    if (req.method === "POST" && resource === "upload") {
      if (!ownerAllowed(req)) return json({ error: "Unauthorized" }, 401);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "Image file required" }, 400);
      if (!file.type.startsWith("image/")) return json({ error: "Only image uploads are allowed" }, 415);
      if (file.size > 8 * 1024 * 1024) return json({ error: "Image must be under 8 MB" }, 413);
      const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const key = `products/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const store = getStore({ name: "jenet-product-images", consistency: "strong" });
      await store.set(key, file, { metadata: { contentType: file.type, originalName: file.name } });
      return json({ ok: true, imageUrl: `/api/store?resource=image&key=${encodeURIComponent(key)}` }, 201);
    }

    if (req.method === "POST" && resource === "review") {
      const body = await req.json();
      const productId = Number(body.productId);
      const rating = Math.max(1, Math.min(5, Number(body.rating)));
      const name = String(body.name || "").trim().slice(0, 80);
      const comment = String(body.comment || "").trim().slice(0, 1200);
      if (!productId || !name || !comment) return json({ error: "Missing review fields" }, 400);
      await db.sql`
        INSERT INTO reviews (product_id, customer_name, rating, comment)
        VALUES (${productId}, ${name}, ${rating}, ${comment})
      `;
      return json({ ok: true }, 201);
    }

    if (req.method === "POST" && resource === "order") {
      const body = await req.json();
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return json({ error: "Cart is empty" }, 400);

      const ids = items.map((x: any) => Number(x.id)).filter(Boolean);
      if (!ids.length) return json({ error: "Invalid cart" }, 400);

      const products = await db.sql`
        SELECT id, name, price, stock FROM products
        WHERE id = ANY(${ids}) AND active = TRUE
      `;
      const byId = new Map(products.map((p: any) => [Number(p.id), p]));
      let total = 0;
      const normalized: any[] = [];

      for (const item of items) {
        const p: any = byId.get(Number(item.id));
        const qty = Math.max(1, Math.min(20, Number(item.qty) || 1));
        if (!p || Number(p.stock) < qty) return json({ error: "Product unavailable or insufficient stock" }, 409);
        total += Number(p.price) * qty;
        normalized.push({ ...p, qty });
      }

      const invoiceNo = "JEN-" + Date.now().toString(36).toUpperCase();
      const customerName = String(body.customerName || "").trim().slice(0, 120);
      const email = String(body.email || "").trim().slice(0, 180);
      const phone = String(body.phone || "").trim().slice(0, 40);
      const address = String(body.address || "").trim().slice(0, 500);
      const paymentMethod = String(body.paymentMethod || "cod").trim().slice(0, 40);

      if (!customerName || !email || !address) return json({ error: "Customer details are required" }, 400);

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        const orderResult = await client.query(
          `INSERT INTO orders (invoice_no, customer_name, email, phone, address, payment_method, total)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, invoice_no, created_at`,
          [invoiceNo, customerName, email, phone, address, paymentMethod, total]
        );
        const order = orderResult.rows[0];

        for (const item of normalized) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, name, qty, unit_price)
             VALUES ($1,$2,$3,$4,$5)`,
            [order.id, item.id, item.name, item.qty, item.price]
          );
          await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [item.qty, item.id]);
        }
        await client.query("COMMIT");

        const gatewayConfigured =
          paymentMethod === "stripe" ? Boolean(Netlify.env.get("STRIPE_SECRET_KEY")) :
          paymentMethod === "razorpay" ? Boolean(Netlify.env.get("RAZORPAY_KEY_SECRET")) :
          paymentMethod === "paypal" ? Boolean(Netlify.env.get("PAYPAL_CLIENT_SECRET")) :
          true;

        return json({
          ok: true,
          order: { ...order, total, items: normalized, customerName, email, phone, address, paymentMethod },
          payment: paymentMethod === "cod"
            ? { status: "pending", message: "Cash on Delivery selected." }
            : gatewayConfigured
              ? { status: "configured", message: "Gateway credentials detected. Provider checkout/webhook connection is still required before live charging." }
              : { status: "configuration_required", message: "Add this gateway's merchant keys in Netlify environment variables." }
        }, 201);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }

    if (req.method === "POST" && resource === "owner-product") {
      if (!ownerAllowed(req)) return json({ error: "Unauthorized" }, 401);
      const body = await req.json();
      const action = String(body.action || "upsert");

      if (action === "delete") {
        const id = Number(body.id);
        await db.sql`UPDATE products SET active = FALSE, updated_at = NOW() WHERE id = ${id}`;
        return json({ ok: true });
      }

      const id = Number(body.id || 0);
      const name = String(body.name || "").trim().slice(0, 160);
      const slug = slugify(String(body.slug || name));
      const description = String(body.description || "").trim().slice(0, 5000);
      const price = Number(body.price || 0);
      const comparePrice = body.comparePrice ? Number(body.comparePrice) : null;
      const stock = Math.max(0, Number(body.stock || 0));
      const category = String(body.category || "Featured").trim().slice(0, 80);
      const imageUrl = String(body.imageUrl || "").trim().slice(0, 1500);
      const badge = String(body.badge || "").trim().slice(0, 40);

      if (!name || !slug || price < 0) return json({ error: "Invalid product" }, 400);

      if (id) {
        await db.sql`
          UPDATE products SET name=${name}, slug=${slug}, description=${description},
            price=${price}, compare_price=${comparePrice}, stock=${stock}, category=${category},
            image_url=${imageUrl}, badge=${badge}, active=TRUE, updated_at=NOW()
          WHERE id=${id}
        `;
      } else {
        await db.sql`
          INSERT INTO products (name, slug, description, price, compare_price, stock, category, image_url, badge)
          VALUES (${name}, ${slug}, ${description}, ${price}, ${comparePrice}, ${stock}, ${category}, ${imageUrl}, ${badge})
        `;
      }
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (error: any) {
    console.error(error);
    return json({ error: "Server error", detail: error?.message || "Unknown error" }, 500);
  }
};
