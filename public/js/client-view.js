import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getStorage,
  ref,
  listAll,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ✅ Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA1jTgM_13IjQS5V-Rc1-6cgC2YYV2GGxY",
  authDomain: "photogallery-saas.firebaseapp.com",
  projectId: "photogallery-saas",
  storageBucket: "photogallery-saas.firebasestorage.app",
  messagingSenderId: "1044919360261",
  appId: "1:1044919360261:web:0a81345d9ae1937856756c",
  measurementId: "G-GGZXM39LHV"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

// 🔍 Parse URL params
const params = new URLSearchParams(window.location.search);
const userId = params.get("uid");
const client = params.get("client");

const galleryContainer = document.getElementById("gallery");

if (!userId || !client) {
  galleryContainer.innerHTML = `<p style="color:red;">Invalid gallery link.</p>`;
} else {
  const folderRef = ref(storage, `galleries/${userId}/${client}`);
  listAll(folderRef)
    .then((res) => {
      if (res.items.length === 0) {
        galleryContainer.innerHTML = `
          <p><img src="public/img/empty-folder.svg" alt="Empty" style="max-width:80px;margin-bottom:12px;"><br>
          No images in this gallery yet.</p>
        `;
        return;
      }

      galleryContainer.innerHTML = ""; // Clear loading message

      res.items.forEach((itemRef) => {
        getDownloadURL(itemRef).then((url) => {
          const img = document.createElement("img");
          img.src = url;
          img.alt = itemRef.name;
          img.className = "shared-image";
          galleryContainer.appendChild(img);
        });
      });
    })
    .catch((err) => {
      console.error("Error loading images:", err);
      galleryContainer.innerHTML = `<p style="color:red;">Failed to load images.</p>`;
    });
}
