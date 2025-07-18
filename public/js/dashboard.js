
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  listAll,
  deleteObject,
  getMetadata
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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
const auth = getAuth(app);
const storage = getStorage(app);

const logoutBtn = document.getElementById("logoutBtn");
const uploadForm = document.getElementById("upload-form");
const imageInput = document.getElementById("imageFiles");
const clientInput = document.getElementById("clientName");
const gallery = document.getElementById("uploadedGallery");
const uploadStatus = document.getElementById("uploadStatus");
const userDisplayName = document.getElementById("userDisplayName");
const galleryList = document.getElementById("galleryList");
const storageUsage = document.getElementById("storageUsage");
const uploadBtn = uploadForm.querySelector("button");

let currentUserId = null;



const imageModal = document.getElementById("imageModal");
const modalImg = document.getElementById("modalImage");
const closeModal = document.getElementById("closeModal");
const prevArrow = document.getElementById("prevArrow");
const nextArrow = document.getElementById("nextArrow");

let currentImageIndex = 0;
let allImagesInFolder = [];

function openModal(images, startIndex) {
  allImagesInFolder = images;
  currentImageIndex = startIndex;
  modalImg.src = allImagesInFolder[currentImageIndex];
  imageModal.style.display = "block";
}

function closeModalFunc() {
  imageModal.style.display = "none";
  allImagesInFolder = [];
}

function showNextImage() {
  if (allImagesInFolder.length === 0) return;
  currentImageIndex = (currentImageIndex + 1) % allImagesInFolder.length;
  modalImg.src = allImagesInFolder[currentImageIndex];
}

function showPrevImage() {
  if (allImagesInFolder.length === 0) return;
  currentImageIndex = (currentImageIndex - 1 + allImagesInFolder.length) % allImagesInFolder.length;
  modalImg.src = allImagesInFolder[currentImageIndex];
}

closeModal.onclick = closeModalFunc;
imageModal.onclick = (e) => {
  if (e.target === imageModal) closeModalFunc();
};
prevArrow.onclick = (e) => {
  e.stopPropagation();
  showPrevImage();
};
nextArrow.onclick = (e) => {
  e.stopPropagation();
  showNextImage();
};

// Optional: Keyboard controls
document.addEventListener("keydown", (e) => {
  if (imageModal.style.display !== "block") return;
  if (e.key === "ArrowRight") showNextImage();
  if (e.key === "ArrowLeft") showPrevImage();
  if (e.key === "Escape") closeModalFunc();
});


// ─────────────────────────────────────────────
// AUTH + INIT
// ─────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) return (window.location.href = "login.html");
  currentUserId = user.uid;
  userDisplayName.textContent = user.displayName || user.email || "Photographer";
  loadGalleryFolders(currentUserId);
  setupUploader(currentUserId);
  displayStorageUsage(currentUserId);
});

logoutBtn?.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
});

// ─────────────────────────────────────────────
// LOAD FOLDERS
// ─────────────────────────────────────────────
function loadGalleryFolders(userId) {
  const baseRef = ref(storage, `galleries/${userId}`);
  galleryList.innerHTML = `<p class="loading-msg">Loading galleries...</p>`;

  listAll(baseRef)
    .then((res) => {
      if (res.prefixes.length === 0) {
        galleryList.innerHTML = `
          <p>
            <img src="public/img/empty-gallery.svg" alt="No galleries" style="max-width:80px;margin-bottom:12px;">
            <br>No galleries found yet.
          </p>`;
        return;
      }

      galleryList.innerHTML = "";

      res.prefixes.forEach((folderRef) => {
        const folderName = folderRef.name;
        const folder = document.createElement("div");
        folder.className = "gallery-folder";

        const titleWrapper = document.createElement("div");
        titleWrapper.className = "folder-info";

        const icon = document.createElement("i");
        icon.className = "fas fa-folder";

        const title = document.createElement("span");
        title.className = "folder-name";
        title.textContent = folderName;

        titleWrapper.append(icon, title);

        const shareBtn = document.createElement("button");
        shareBtn.className = "share-btn";
        shareBtn.innerHTML = '<i class="fas fa-link" style="margin-right: 6px;"></i>Share';
        shareBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const shareURL = `${window.location.origin}/client-view.html?uid=${userId}&client=${folderName}`;
navigator.clipboard.writeText(shareURL)
  .then(() => {
    shareBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 6px;"></i>Copied!';
    setTimeout(() => {
      shareBtn.innerHTML = '<i class="fas fa-link" style="margin-right: 6px;"></i>Share';
    }, 2000);
  })
  .catch(() => {
    shareBtn.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 6px;"></i>Error!';
    setTimeout(() => {
      shareBtn.innerHTML = '<i class="fas fa-link" style="margin-right: 6px;"></i>Share';
    }, 2000);
  });

        });

        const zipBtn = createDownloadZipButton(userId, folderName);

const actionGroup = document.createElement("div");
actionGroup.className = "folder-actions";
actionGroup.appendChild(shareBtn);
actionGroup.appendChild(zipBtn);


        const imagesContainer = document.createElement("div");
        imagesContainer.className = "folder-images";
        imagesContainer.style.display = "none";

       folder.append(titleWrapper, actionGroup, imagesContainer);

        let isOpen = false;

titleWrapper.addEventListener("click", () => {
  if (isOpen) {
    imagesContainer.innerHTML = "";
    imagesContainer.style.display = "none";
    icon.className = "fas fa-folder";
  } else {
    imagesContainer.innerHTML = "<p class='loading-msg'>Loading...</p>";
    imagesContainer.style.display = "block";
    icon.className = "fas fa-folder-open";

    const innerRef = ref(storage, `galleries/${userId}/${folderName}`);
    listAll(innerRef).then((res) => {
  const maxPreview = 5;
  const total = res.items.length;

  imagesContainer.innerHTML = "";
  title.textContent = `${folderName} (${total} images)`;

  Promise.all(res.items.map(itemRef =>
    getDownloadURL(itemRef).then((url) => ({ url, itemRef }))
  )).then((imageData) => {
    const previewData = imageData.slice(0, maxPreview);
    const extraData = imageData.slice(maxPreview);

    const allUrls = imageData.map(d => d.url);

    previewData.forEach(({ url, itemRef }, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "image-wrapper";

      const img = document.createElement("img");
      img.src = url;
      img.alt = itemRef.name;

      img.addEventListener("click", (e) => {
        e.stopPropagation();
        openModal(allUrls, index);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "delete-btn";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteObject(itemRef)
          .then(() => wrapper.remove())
          .catch((err) => console.error("Delete failed:", err));
      });

      wrapper.appendChild(img);
      wrapper.appendChild(delBtn);
      imagesContainer.appendChild(wrapper);
    });

    if (extraData.length > 0) {
      const more = document.createElement("div");
      more.className = "image-wrapper more-label";
      more.textContent = `+${extraData.length} more`;

      more.addEventListener("click", (e) => {
        e.stopPropagation();
        more.remove();

        extraData.forEach(({ url, itemRef }, indexOffset) => {
          const wrapper = document.createElement("div");
          wrapper.className = "image-wrapper";

          const img = document.createElement("img");
          img.src = url;
          img.alt = itemRef.name;

          img.addEventListener("click", (e) => {
            e.stopPropagation();
            openModal(allUrls, indexOffset + maxPreview); // adjusted index
          });

          const delBtn = document.createElement("button");
          delBtn.className = "delete-btn";
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteObject(itemRef)
              .then(() => wrapper.remove())
              .catch((err) => console.error("Delete failed:", err));
          });

          wrapper.appendChild(img);
          wrapper.appendChild(delBtn);
          imagesContainer.appendChild(wrapper);
        });
      });

      imagesContainer.appendChild(more);
    }
  });
});


          }

          isOpen = !isOpen;
        });

       
  galleryList.appendChild(folder);
      });
    })
    .catch((err) => {
      console.error("Error loading folders:", err);
      galleryList.innerHTML = `<p style="color:red;">Error loading galleries.</p>`;
    });
}

// ─────────────────────────────────────────────
// UPLOAD
// ─────────────────────────────────────────────
function setupUploader(userId) {
  uploadForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const clientName = clientInput.value.trim();
    const files = imageInput.files;

    if (!clientName || files.length === 0) {
      uploadStatus.textContent = "Please enter a client name and select at least one image.";
      uploadStatus.style.color = "red";
      return;
    }

    uploadStatus.textContent = `Uploading ${files.length} file(s)...`;
    uploadStatus.style.color = "#333";
    uploadBtn.disabled = true;

    let completed = 0;

    [...files].forEach((file) => {
      const filePath = `galleries/${userId}/${clientName}/${file.name}`;
      const fileRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on("state_changed",
        null,
        (error) => {
          console.error("Upload failed:", error);
          uploadStatus.textContent = "Upload failed. Please try again.";
          uploadStatus.style.color = "red";
          uploadBtn.disabled = false;
        },
        () => {
          completed++;
          if (completed === files.length) {
            uploadStatus.textContent = "All images uploaded!";
            uploadStatus.style.color = "green";
            uploadForm.reset();
            uploadBtn.disabled = false;
            loadGalleryFolders(userId);
            displayStorageUsage(userId);
          }
        }
      );
    });
  });
}

// ─────────────────────────────────────────────
// STORAGE TRACKER
// ─────────────────────────────────────────────
function displayStorageUsage(userId, limitMB = 1024) {
  const baseRef = ref(storage, `galleries/${userId}`);
  let totalBytes = 0;

  listAll(baseRef)
    .then((res) => {
      const folders = res.prefixes;
      if (folders.length === 0) {
        storageUsage.textContent = `0 MB of ${limitMB} MB used`;
        return;
      }

      let completed = 0;

      folders.forEach((folderRef) => {
        listAll(folderRef).then((res2) => {
          const promises = res2.items.map((itemRef) =>
            getMetadata(itemRef)
              .then((meta) => {
                totalBytes += meta.size || 0;
              })
              .catch(() => {})
          );

          Promise.all(promises).then(() => {
            completed++;
            if (completed === folders.length) {
              const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);
              storageUsage.textContent = `${usedMB} MB of ${limitMB} MB used`;
              storageUsage.style.color = usedMB / limitMB >= 0.9 ? "red" : "#333";
            }
          });
        });
      });
    })
    .catch((err) => {
      console.error("Error tracking storage:", err);
      storageUsage.textContent = "Error checking usage.";
    });
}


const functions = getFunctions(app);


const generateZip = httpsCallable(functions, "generateZip");

function createDownloadZipButton(uid, galleryName) {
  const button = document.createElement("button");
  button.className = "cta-button zip-download-btn";
  button.innerHTML = '<i class="fas fa-file-archive" style="margin-right: 6px;"></i>Download ZIP';
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Preparing...";
    try {
      const result = await generateZip({ uid, gallery: galleryName });
      const link = document.createElement("a");
      link.href = result.data.url;
      link.download = `${galleryName}.zip`;
      link.click();
      button.innerHTML = '<i class="fas fa-file-archive" style="margin-right: 6px;"></i>Download Again';
    } catch (error) {
      console.error("Error generating ZIP:", error);
      alert("Failed to generate ZIP. Try again later.");
      button.innerHTML = '<i class="fas fa-file-archive" style="margin-right: 6px;"></i>Download ZIP';
    } finally {
      button.disabled = false;
    }
  };
  return button;
}
