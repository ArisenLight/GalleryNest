const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const archiver = require("archiver");
const { Storage } = require("@google-cloud/storage");

admin.initializeApp();
const gcs = new Storage();

exports.generateZip = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const { uid, folder } = req.query;

    if (!uid || !folder) {
      return res.status(400).send("Missing uid or folder");
    }

    const bucket = admin.storage().bucket();
    const prefix = `galleries/${uid}/${folder}/`;

    try {
      const [files] = await bucket.getFiles({ prefix });

      if (!files.length) {
        return res.status(404).send("No files found in this folder");
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${folder}.zip"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", err => res.status(500).send({ error: err.message }));
      archive.pipe(res);

      for (const file of files) {
        const filePath = file.name.replace(prefix, ""); // Strip folder path
        archive.append(file.createReadStream(), { name: filePath });
      }

      await archive.finalize();
    } catch (err) {
      console.error("ZIP error:", err);
      res.status(500).send("Failed to create ZIP");
    }
  });
});
