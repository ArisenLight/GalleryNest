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

// Init Admin
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// Stripe secret from .env
const STRIPE_SECRET = process.env.STRIPE_SECRET;
const stripe = STRIPE_SECRET ? stripeLib(STRIPE_SECRET) : null;

// Stripe Price IDs
const PRICE_IDS = {
  pro: 'price_pro_monthly_id_here',
  business: 'price_business_monthly_id_here',
};

// Plan limits
const MB = 1024 * 1024;
const GB = 1024 * MB;
const PLAN_LIMITS = { free: 100 * MB, pro: 10 * GB, business: 50 * GB };
const limitForPlan = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.free;

// IMPORTANT: bucket name, not domain. Check in Firebase Console Storage header.
const BUCKET = 'photogallery-saas.firebasestorage.app'; // update if your console shows a different name

/* ================
   Gen 2 onRequest
   ================ */

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

// Name with V2 suffix to allow side by side testing
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

exports.createCheckoutSessionV2 = onCall(
  { region: REGION_AU, memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const auth = request.auth;
    if (!auth) return { error: 'unauthenticated' };
    if (!stripe) return { error: 'Stripe not configured' };

    const plan = request.data?.plan || 'pro';
    if (!PRICE_IDS[plan]) return { error: 'Unknown plan' };

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
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: 'https://gallerynest.syntaxcorestudio.com/dashboard.html?checkout=success',
      cancel_url: 'https://gallerynest.syntaxcorestudio.com/signup.html?checkout=cancel',
      allow_promotion_codes: true
    });

    return { id: session.id, url: session.url };
  }
);
