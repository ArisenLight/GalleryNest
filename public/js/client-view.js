import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getStorage,
  ref,
  listAll,
  getDownloadURL,
  getMetadata
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

// ⬇️ Add Download ZIP Button
function createClientDownloadZipButton(uid, gallery) {
  const button = document.createElement("button");
  button.className = "cta-button";
  button.innerHTML = '<i class="fas fa-file-archive" style="margin-right: 6px;"></i>Download ZIP';

  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Preparing...";

    const url = `https://us-central1-photogallery-saas.cloudfunctions.net/generateZip?uid=${uid}&folder=${gallery}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("ZIP failed");

      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${gallery}.zip`;
      link.click();

      button.innerHTML = '<i class="fas fa-file-archive" style="margin-right: 6px;"></i>Download Again';
    } catch (error) {
      console.error("ZIP download failed:", error);
      alert("Could not generate ZIP. Please try again.");
      button.innerHTML = '<i class="fas fa-file-archive" style="margin-right: 6px;"></i>Download ZIP';
    } finally {
      button.disabled = false;
    }
  };

  return button;
}


// 🖼️ Modal Setup
let allImageUrls = [];
let currentIndex = 0;

const modal = document.createElement("div");
modal.id = "imageModal";
modal.style.display = "none";
modal.style.position = "fixed";
modal.style.zIndex = "9999";
modal.style.left = "0";
modal.style.top = "0";
modal.style.width = "100%";
modal.style.height = "100%";
modal.style.backgroundColor = "rgba(0,0,0,0.85)";
modal.innerHTML = `
  <span id="closeModal" style="position:absolute;top:20px;right:30px;font-size:40px;cursor:pointer;color:white;">&times;</span>
  <img id="modalImage" style="display:block;max-width:90%;max-height:80vh;margin:60px auto;" />
  <div id="prevArrow" style="position:absolute;top:50%;left:30px;font-size:40px;cursor:pointer;color:white;">❮</div>
  <div id="nextArrow" style="position:absolute;top:50%;right:30px;font-size:40px;cursor:pointer;color:white;">❯</div>
`;
document.body.appendChild(modal);

const modalImg = modal.querySelector("#modalImage");
const closeModal = modal.querySelector("#closeModal");
const prevArrow = modal.querySelector("#prevArrow");
const nextArrow = modal.querySelector("#nextArrow");

function openModal(images, index) {
  allImageUrls = images;
  currentIndex = index;
  modalImg.src = allImageUrls[currentIndex];
  modal.style.display = "block";
}

function showPrevImage() {
  if (allImageUrls.length > 0) {
    currentIndex = (currentIndex - 1 + allImageUrls.length) % allImageUrls.length;
    modalImg.src = allImageUrls[currentIndex];
  }
}

function showNextImage() {
  if (allImageUrls.length > 0) {
    currentIndex = (currentIndex + 1) % allImageUrls.length;
    modalImg.src = allImageUrls[currentIndex];
  }
}

closeModal.onclick = () => modal.style.display = "none";
prevArrow.onclick = showPrevImage;
nextArrow.onclick = showNextImage;
modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

document.addEventListener("keydown", (e) => {
  if (modal.style.display !== "block") return;
  if (e.key === "ArrowLeft") showPrevImage();
  if (e.key === "ArrowRight") showNextImage();
  if (e.key === "Escape") modal.style.display = "none";
});

// Mixed-media preview card
function createPreviewCard({ url, contentType, name }, imagesOnly, imageIndexMap) {
  const wrapper = document.createElement("div");
  wrapper.className = "image-wrapper";

  if (contentType?.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = name;
    img.className = "shared-image";
    const idxForModal = imageIndexMap.get(url);
    img.style.cursor = "pointer";
    img.addEventListener("click", () => openModal(imagesOnly.map(i => i.url), idxForModal));
    wrapper.appendChild(img);

  } else if (contentType?.startsWith("video/")) {
    const vid = document.createElement("video");
    vid.src = url;
    vid.controls = true;
    vid.preload = "metadata";
    vid.style.width = "100%";
    vid.style.height = "100%";
    vid.style.objectFit = "cover";
    wrapper.appendChild(vid);

  } else if (contentType?.startsWith("audio/")) {
    const box = document.createElement("div");
    box.className = "file-card";
    box.innerHTML = `<i class="fas fa-music"></i><span class="file-name" title="${name}">${name}</span>`;
    const audio = document.createElement("audio");
    audio.src = url;
    audio.controls = true;
    audio.style.width = "100%";
    box.appendChild(audio);
    wrapper.appendChild(box);

  } else {
    const box = document.createElement("div");
    box.className = "file-card";
    box.innerHTML = `
      <i class="fas fa-file"></i>
      <span class="file-name" title="${name}">${name}</span>
      <a class="file-download" href="${url}" download>Download</a>
    `;
    wrapper.appendChild(box);
  }

  return wrapper;
}

// Main load
(async function init() {
  if (!userId || !client) {
    galleryContainer.innerHTML = `<p style="color:red;">Invalid gallery link.</p>`;
    return;
  }

  // ZIP button above gallery
  const zipBtn = createClientDownloadZipButton(userId, client);
  galleryContainer.parentNode.insertBefore(zipBtn, galleryContainer);

  // List files
  const folderRef = ref(storage, `galleries/${userId}/${client}`);
  try {
    const res = await listAll(folderRef);
    if (res.items.length === 0) {
      galleryContainer.innerHTML = `
        <p><img src="public/img/empty-folder.svg" alt="Empty" style="max-width:80px;margin-bottom:12px;"><br>
        No items in this gallery yet.</p>
      `;
      return;
    }

    // Fetch URL + metadata for each file
    const fileData = await Promise.all(
      res.items.map(async (itemRef) => {
        try {
          const [url, meta] = await Promise.all([getDownloadURL(itemRef), getMetadata(itemRef)]);
          return { url, contentType: meta.contentType || "", name: itemRef.name };
        } catch (err) {
          console.error("Could not fetch URL or metadata for", itemRef.fullPath, err);
          return null;
        }
      })
    );
    const files = fileData.filter(Boolean);

    // Build image list for modal only
    const imagesOnly = files.filter(f => f.contentType.startsWith("image/"));
    const imageIndexMap = new Map(imagesOnly.map((f, idx) => [f.url, idx]));

    galleryContainer.innerHTML = "";
    files.forEach(f => {
      galleryContainer.appendChild(createPreviewCard(f, imagesOnly, imageIndexMap));
    });

  } catch (err) {
    console.error("Error loading gallery:", err);
    galleryContainer.innerHTML = `<p style="color:red;">Failed to load gallery.</p>`;
  }
})();
