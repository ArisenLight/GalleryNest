// functions/index.js

// Regions
const REGION_AU = 'australia-southeast1';
const REGION_US = 'us-central1';

const admin = require('firebase-admin');
const archiver = require('archiver');
const stripeLib = require('stripe');

// Gen 2 APIs
const { onRequest, onCall } = require('firebase-functions/v2/https');
const { onObjectFinalized, onObjectDeleted } = require('firebase-functions/v2/storage');
const { defineSecret } = require('firebase-functions/params');

// Init Admin
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// Stripe secrets (defined in Firebase CLI)
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const PRICE_PRO_MONTHLY = defineSecret('PRICE_PRO_MONTHLY');
const PRICE_BUSINESS_MONTHLY = defineSecret('PRICE_BUSINESS_MONTHLY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Plan limits
const MB = 1024 * 1024;
const GB = 1024 * MB;
const PLAN_LIMITS = { free: 100 * MB, pro: 10 * GB, business: 50 * GB };
const limitForPlan = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.free;

// IMPORTANT: bucket name, not domain. Check in Firebase Console Storage header.
const BUCKET = 'photogallery-saas.firebasestorage.app'; // update if your console shows a different bucket name

/* ================
   Gen 2 onRequest
   ================ */

// Generate ZIP for gallery downloads
exports.generateZip = onRequest(
  {
    region: REGION_US,
    memory: '1GiB',
    cpu: 1,
    timeoutSeconds: 540,
    cors: true
  },
  async (req, res) => {
    try {
      const { uid, folder } = req.query;
      if (!uid || !folder) return res.status(400).send('Missing uid or folder');

      const bucket = admin.storage().bucket(); // default bucket
      const prefix = `galleries/${uid}/${folder}/`;
      const [files] = await bucket.getFiles({ prefix });

      if (!files.length) return res.status(404).send('No files found in this folder');

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${folder}.zip"`);
      res.setHeader('Cache-Control', 'private, max-age=60');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', err => {
        console.error('archiver error', err);
        res.status(500).send({ error: err.message });
      });
      archive.pipe(res);

      for (const file of files) {
        const nameInZip = file.name.replace(prefix, '');
        archive.append(file.createReadStream(), { name: nameInZip });
      }

      await archive.finalize();
    } catch (err) {
      console.error('ZIP error:', err);
      res.status(500).send('Failed to create ZIP');
    }
  }
);

/* ========================
   Gen 2 Storage triggers
   ======================== */

// Track storage usage on upload
exports.onImageFinalize = onObjectFinalized(
  { region: REGION_US, bucket: BUCKET, memory: '256MiB' },
  async (event) => {
    const object = event.data;
    const uid = object.metadata && object.metadata.ownerUid;
    if (!uid) return;
    const bytes = Number(object.size || 0);
    await db.collection('users').doc(uid).set(
      { storageUsed: admin.firestore.FieldValue.increment(bytes) },
      { merge: true }
    );
  }
);

// Track storage usage on delete
exports.onImageDelete = onObjectDeleted(
  { region: REGION_US, bucket: BUCKET, memory: '256MiB' },
  async (event) => {
    const object = event.data;
    const uid = object.metadata && object.metadata.ownerUid;
    if (!uid) return;
    const bytes = Number(object.size || 0);
    await db.collection('users').doc(uid).set(
      { storageUsed: admin.firestore.FieldValue.increment(-bytes) },
      { merge: true }
    );
  }
);

/* ========================
   Gen 2 Callables (V2)
   ======================== */

// Check quota + plan info
exports.checkQuotaV2 = onCall(
  { region: REGION_AU, memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) return { ok: false, error: 'unauthenticated' };

    const uid = auth.uid;
    const addSize = Number(request.data?.size || 0);

    const doc = await db.collection('users').doc(uid).get();
    const user = doc.data() || {};
    const plan = user.plan || 'free';
    const used = Number(user.storageUsed || 0);
    const limit = Number(user.storageLimit || limitForPlan(plan));

    const ok = used + addSize <= limit;
    return { ok, plan, used, limit };
  }
);


// Helper: ensure we always have a valid customer in the current Stripe mode
async function getOrCreateValidCustomer(stripe, uid, db) {
  const docRef = db.collection('stripe_customers').doc(uid);
  const snap = await docRef.get();

  let customerId = snap.exists && snap.data().customerId ? snap.data().customerId : null;

  if (customerId) {
    try {
      await stripe.customers.retrieve(customerId); // throws if not found
    } catch (e) {
      if (e && (e.statusCode === 404 || e.code === 'resource_missing')) {
        customerId = null; // remove old (test) customer id
      } else {
        throw e; // unexpected error
      }
    }
  }

  if (!customerId) {
    const created = await stripe.customers.create({ metadata: { firebaseUID: uid } });
    customerId = created.id;
    await docRef.set({ customerId }, { merge: true });
  }

  return customerId;
}



// Create a Stripe Checkout Session
exports.createCheckoutSession = onCall(
  {
    region: REGION_AU,
    memory: '256MiB',
    timeoutSeconds: 60,
    secrets: [STRIPE_SECRET_KEY, PRICE_PRO_MONTHLY, PRICE_BUSINESS_MONTHLY]
  },
  async (request) => {
    try {
      const auth = request.auth;
      if (!auth) return { error: 'unauthenticated' };

      const stripe = stripeLib(STRIPE_SECRET_KEY.value());
      const planKey = request.data?.plan || 'pro';

      const priceId =
        planKey === 'pro' ? PRICE_PRO_MONTHLY.value() :
        planKey === 'business' ? PRICE_BUSINESS_MONTHLY.value() :
        null;

      if (!priceId) return { error: 'Unknown plan' };

      const uid = auth.uid;
      const customerId = await getOrCreateValidCustomer(stripe, uid, db);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { trial_period_days: 14 },
        success_url: 'https://gallerynest.syntaxcorestudio.com/dashboard.html?checkout=success',
        cancel_url: 'https://gallerynest.syntaxcorestudio.com/dashboard.html?checkout=cancel',
        allow_promotion_codes: true,
        metadata: { firebaseUID: uid }
      });

      return { id: session.id, url: session.url };
    } catch (err) {
      console.error("createCheckoutSession error:", {
        type: err.type, code: err.code, statusCode: err.statusCode, message: err.message
      });
      return { error: err.message || "Checkout failed" };
    }
  }
);


// Optional alias so old client names still work
exports.createCheckoutSessionV2 = exports.createCheckoutSession;


// Create a Stripe Billing Portal Session
// add near other exports
exports.createBillingPortalSession = onCall(
  {
    region: REGION_AU,
    memory: '256MiB',
    timeoutSeconds: 60,
    secrets: [STRIPE_SECRET_KEY]
  },
  async (request) => {
    try {
      const auth = request.auth;
      if (!auth) return { error: 'unauthenticated' };

      const stripe = stripeLib(STRIPE_SECRET_KEY.value());
      const uid = auth.uid;

      const customerId = await getOrCreateValidCustomer(stripe, uid, db);

      const returnUrl = request.data?.returnUrl || 'https://gallerynest.syntaxcorestudio.com/dashboard.html';
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });

      return { url: portal.url };
    } catch (err) {
      console.error("createBillingPortalSession error:", {
        type: err.type, code: err.code, statusCode: err.statusCode, message: err.message
      });
      return { error: err.message || "Portal failed" };
    }
  }
);




// Stripe Webhook
exports.stripeWebhook = onRequest(
  { region: REGION_US, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const stripe = stripeLib(STRIPE_SECRET_KEY.value());

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      console.error('Webhook signature error', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.mode !== 'subscription') break;

          // get subscription to find the priceId
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const planId = sub.items.data[0].price.id;
          const plan =
            planId === PRICE_PRO_MONTHLY.value() ? 'pro' :
            planId === PRICE_BUSINESS_MONTHLY.value() ? 'business' : 'free';

          // look up uid
          const customerId = session.customer;
          const match = await db.collection('stripe_customers').where('customerId', '==', customerId).limit(1).get();
          if (!match.empty) {
            const uid = match.docs[0].id;
            await db.collection('users').doc(uid).set(
              { plan, storageLimit: limitForPlan(plan) },
              { merge: true }
            );
          }
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const planId = sub.items.data[0].price.id;
          const plan =
            planId === PRICE_PRO_MONTHLY.value() ? 'pro' :
            planId === PRICE_BUSINESS_MONTHLY.value() ? 'business' : 'free';

          const customerId = sub.customer;
          const match = await db.collection('stripe_customers').where('customerId', '==', customerId).limit(1).get();
          if (!match.empty) {
            const uid = match.docs[0].id;
            const docRef = db.collection('users').doc(uid);

            // downgrade if canceled/inactive
            const status = sub.status;
            if (event.type === 'customer.subscription.deleted' || status !== 'active') {
              await docRef.set(
                { plan: 'free', storageLimit: limitForPlan('free') },
                { merge: true }
              );
            } else {
              await docRef.set(
                { plan, storageLimit: limitForPlan(plan) },
                { merge: true }
              );
            }
          }
          break;
        }

        default:
          console.log(`Unhandled event: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Webhook error', err);
      res.status(500).send('Webhook handler error');
    }
  }
);

