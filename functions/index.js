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

// Create a Stripe Checkout Session
exports.createCheckoutSession = onCall(
  {
    region: REGION_AU,
    memory: '256MiB',
    timeoutSeconds: 60,
    secrets: [STRIPE_SECRET_KEY, PRICE_PRO_MONTHLY, PRICE_BUSINESS_MONTHLY]
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) return { error: 'unauthenticated' };

    const stripe = stripeLib(STRIPE_SECRET_KEY.value());
    const planKey = request.data?.plan || 'pro';

    const priceId =
      planKey === 'pro'
        ? PRICE_PRO_MONTHLY.value()
        : planKey === 'business'
        ? PRICE_BUSINESS_MONTHLY.value()
        : null;

    if (!priceId) return { error: 'Unknown plan' };

    const uid = auth.uid;
    const customersRef = db.collection('stripe_customers').doc(uid);
    const snap = await customersRef.get();

    let customerId = snap.exists && snap.data().customerId
      ? snap.data().customerId
      : (await stripe.customers.create({ metadata: { firebaseUID: uid } })).id;

    if (!snap.exists || !snap.data().customerId) {
      await customersRef.set({ customerId }, { merge: true });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: 'https://gallerynest.syntaxcorestudio.com/dashboard.html?checkout=success',
      cancel_url: 'https://gallerynest.syntaxcorestudio.com/dashboard.html?checkout=cancel',
      allow_promotion_codes: true
    });

    return { id: session.id, url: session.url };
  }
);

// Create a Stripe Billing Portal Session
// add near other exports
exports.createBillingPortalSession = onCall(
  { region: REGION_AU, memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) return { error: 'unauthenticated' };
    if (!stripe) return { error: 'Stripe not configured' };

    const uid = auth.uid;

    // get or create a Stripe customer for this Firebase user
    const custRef = db.collection('stripe_customers').doc(uid);
    const snap = await custRef.get();

    let customerId = snap.exists && snap.data().customerId
      ? snap.data().customerId
      : (await stripe.customers.create({ metadata: { firebaseUID: uid } })).id;

    if (!snap.exists || !snap.data().customerId) {
      await custRef.set({ customerId }, { merge: true });
    }

    // Use the current page as returnUrl if provided
    const returnUrl = request.data?.returnUrl || 'https://gallerynest.syntaxcorestudio.com/dashboard.html';

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    return { url: portal.url };
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

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
      const subscription = event.data.object;
      const uid = subscription.metadata?.firebaseUID;
      if (uid) {
        const planId = subscription.items.data[0].price.id;
        const plan =
          planId === PRICE_PRO_MONTHLY.value()
            ? 'pro'
            : planId === PRICE_BUSINESS_MONTHLY.value()
            ? 'business'
            : 'free';

        await db.collection('users').doc(uid).set(
          { plan, storageLimit: limitForPlan(plan) },
          { merge: true }
        );
      }
    }

    res.json({ received: true });
  }
);
