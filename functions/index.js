// functions/index.js

// Regions
const REGION_AU = 'australia-southeast1';
const REGION_US = 'us-central1';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const archiver = require('archiver');
// const { Storage } = require('@google-cloud/storage'); // not used right now
const stripeLib = require('stripe');

// Init Admin
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// Stripe
const STRIPE_SECRET = functions.config().stripe?.secret;
const stripe = STRIPE_SECRET ? stripeLib(STRIPE_SECRET) : null;

// Price IDs in one place
const PRICE_IDS = {
  pro: 'price_pro_monthly_id_here',
  business: 'price_business_monthly_id_here',
};

// Plan limits
const MB = 1024 * 1024;
const GB = 1024 * MB;
const PLAN_LIMITS = { free: 100 * MB, pro: 10 * GB, business: 50 * GB };
const limitForPlan = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.free;

/* ===========================================
   US functions (close to your Storage bucket)
   =========================================== */

// ZIP from us-central1 bucket
exports.generateZip = functions
  .runWith({ memory: '1GiB', timeoutSeconds: 540 })
  .region(REGION_US)
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      try {
        if (req.method === 'OPTIONS') {
          res.set('Access-Control-Allow-Methods', 'GET');
          res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          return res.status(204).send('');
        }

        const { uid, folder } = req.query;
        if (!uid || !folder) return res.status(400).send('Missing uid or folder');

        const bucket = admin.storage().bucket(); // default us-central1 bucket
        const prefix = `galleries/${uid}/${folder}/`;
        const [files] = await bucket.getFiles({ prefix });

        if (!files.length) return res.status(404).send('No files found in this folder');

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${folder}.zip"`);
        res.setHeader('Cache-Control', 'private, max-age=60');

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', err => { console.error('archiver error', err); res.status(500).send({ error: err.message }); });
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
    });
  });

// Storage usage accounting in US
exports.onImageFinalize = functions
  .region(REGION_US)
  .storage.object()
  .onFinalize(async (object) => {
    const uid = object.metadata && object.metadata.ownerUid;
    if (!uid) return;
    const bytes = Number(object.size || 0);
    await db.collection('users').doc(uid)
      .set({ storageUsed: admin.firestore.FieldValue.increment(bytes) }, { merge: true });
  });

exports.onImageDelete = functions
  .region(REGION_US)
  .storage.object()
  .onDelete(async (object) => {
    const uid = object.metadata && object.metadata.ownerUid;
    if (!uid) return;
    const bytes = Number(object.size || 0);
    await db.collection('users').doc(uid)
      .set({ storageUsed: admin.firestore.FieldValue.increment(-bytes) }, { merge: true });
  });

/* ===========================================
   AU functions (close to Firestore and users)
   =========================================== */

exports.createCheckoutSession = functions
  .region(REGION_AU)
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required.');
    if (!stripe) throw new functions.https.HttpsError('failed-precondition', 'Stripe not configured.');

    const plan = (data?.plan || 'pro');
    if (!PRICE_IDS[plan]) throw new functions.https.HttpsError('invalid-argument', 'Unknown plan.');

    const uid = context.auth.uid;
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
  });

exports.checkQuota = functions
  .region(REGION_AU)
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required.');
    const uid = context.auth.uid;
    const addSize = Number(data?.size || 0);

    const doc = await db.collection('users').doc(uid).get();
    const user = doc.data() || {};
    const plan = user.plan || 'free';
    const used = Number(user.storageUsed || 0);
    const limit = Number(user.storageLimit || limitForPlan(plan));

    const ok = used + addSize <= limit;
    return { ok, plan, used, limit };
  });
