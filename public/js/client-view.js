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

// 🔽 Load Images + Insert ZIP button
if (!userId || !client) {
  galleryContainer.innerHTML = `<p style="color:red;">Invalid gallery link.</p>`;
} else {
  const zipBtn = createClientDownloadZipButton(userId, client);
  galleryContainer.parentNode.insertBefore(zipBtn, galleryContainer);

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

      galleryContainer.innerHTML = ""; // Clear loading

      const imagePromises = res.items.map((itemRef) =>
        getDownloadURL(itemRef).then((url) => ({ url, name: itemRef.name }))
      );

      Promise.all(imagePromises).then((images) => {
        images.forEach(({ url, name }, index) => {
          const img = document.createElement("img");
          img.src = url;
          img.alt = name;
          img.className = "shared-image";
          img.style.cursor = "pointer";
          img.addEventListener("click", () => openModal(images.map(i => i.url), index));
          galleryContainer.appendChild(img);
        });
      });
    })
    .catch((err) => {
      console.error("Error loading images:", err);
      galleryContainer.innerHTML = `<p style="color:red;">Failed to load images.</p>`;
    });
}
