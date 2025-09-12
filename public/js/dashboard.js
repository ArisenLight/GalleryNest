
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
const functionsAU = getFunctions(app, 'australia-southeast1');
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

const billingInfoEl = document.getElementById("billingInfo");

function approx(val, target, tol = 0.6) {
  return Math.abs(val - target) <= tol;
}

function planFromLimit(limitBytes) {
  if (typeof limitBytes !== "number" || !isFinite(limitBytes)) {
    return { name: "Unknown", cls: "custom" };
  }

  const limitMB = limitBytes / (1024 * 1024);  // convert bytes → MB
  const limitGB = limitBytes / (1024 * 1024 * 1024);

  // Free: 100 MB
  if (limitGB <= 120) {
    return { name: "Free", cls: "free" };
  }

  // Pro: 10 GB
  if (limitGB <= 11) {
    return { name: "Pro", cls: "pro" };
  }

  // Business: 50 GB
  if (limitGB <= 55) {
    return { name: "Business", cls: "business" };
  }

  // Anything else
  return { name: "Custom", cls: "custom" };
}

const upgradeLi = document.getElementById("upgrade");
const upgradeBtn = upgradeLi?.querySelector("button");
const planModal = document.getElementById("planModal");
const currentPlanEl = document.getElementById("currentPlan");
const manageBillingBtn = document.getElementById("manageBillingBtn");
const closePlanModal = document.getElementById("closePlanModal");


function showPlanModal(planName) {
  if (currentPlanEl) currentPlanEl.textContent = planName || "Unknown";
  planModal.style.display = "block";
}

function hidePlanModal() {
  planModal.style.display = "none";
}

closePlanModal?.addEventListener("click", hidePlanModal);
planModal?.addEventListener("click", (e) => {
  if (e.target === planModal) hidePlanModal();
});

upgradeBtn?.addEventListener("click", async () => {
  // Open modal with detected plan from your badge
  const badge = document.querySelector("#billingInfo .plan-badge");
  const name = badge ? badge.textContent.trim() : null;
  showPlanModal(name);
});

// Click handlers for plan buttons
document.querySelectorAll(".plan-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    const planKey = btn.getAttribute("data-plan");
    await startCheckout(planKey);
  });
});

// Manage billing opens the Stripe customer portal
manageBillingBtn?.addEventListener("click", async () => {
  try {
    const portalCallable = httpsCallable(functionsAU, "createBillingPortalSession");
    const { data } = await portalCallable({ returnUrl: window.location.href });
    if (data?.url) window.location.assign(data.url);
  } catch (err) {
    console.error("Portal error", err);
    alert("Could not open billing portal. Try again shortly.");
  }
});

// Start Checkout for a selected plan
async function startCheckout(planKey) {
  if (!["pro","business"].includes(planKey)) return alert("Unknown plan");

  try {
    document.querySelectorAll(".plan-btn").forEach(b => b.disabled = true);

    // call the canonical name (alias exists too)
    const createSession = httpsCallable(functionsAU, "createCheckoutSession");
const { data } = await createSession({ plan: planKey });
console.log("createCheckoutSession response:", data);

if (data?.error) {
  throw new Error(data.error);
}
if (data?.url) {
  window.location.assign(data.url);
  return;
}
throw new Error("No checkout url from server");

  } catch (err) {
    console.error("Checkout error", err);
    alert("Could not start checkout. Try again.");
  } finally {
    document.querySelectorAll(".plan-btn").forEach(b => b.disabled = false);
  }
}


async function updateBillingInfo() {
  if (!billingInfoEl) return;
  try {
    const checkQuota = httpsCallable(functionsAU, "checkQuotaV2");
    const { data } = await checkQuota({ size: 0 });

    const plan = planFromLimit(data.limit);

    billingInfoEl.innerHTML = `
      Plan: <span class="plan-badge ${plan.cls}">${plan.name}</span>
    `;
  } catch (err) {
    console.error("updateBillingInfo failed:", err);
    billingInfoEl.textContent = "Plan: Unknown";
  }
}


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
  updateBillingInfo();
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


        //Share and download button
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

listAll(innerRef)
  .then(async (res) => {
    // Fetch URL + metadata for each item
    const fileData = await Promise.all(
      res.items.map(async (itemRef) => {
        try {
          const [url, meta] = await Promise.all([
            getDownloadURL(itemRef),
            getMetadata(itemRef),
          ]);
        return { url, itemRef, contentType: meta.contentType || "", name: itemRef.name };
        } catch (err) {
          console.error("Failed URL/meta for", itemRef.fullPath, err);
          return null;
        }
      })
    );

    const files = fileData.filter(Boolean);
    const maxPreview = 5;
    const total = files.length;

    imagesContainer.innerHTML = "";
    title.textContent = `${folderName} (${total} items)`;

    const previewData = files.slice(0, maxPreview);
    const extraData   = files.slice(maxPreview);

    // Build a list of images only for the modal, so indexes are correct
    const imagesOnly = files.filter(f => f.contentType.startsWith("image/"));
    const imageIndexMap = new Map(imagesOnly.map((f, idx) => [f.url, idx]));

    function createPreviewCard({ url, itemRef, contentType, name }) {
      const wrapper = document.createElement("div");
      wrapper.className = "image-wrapper";

      if (contentType.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = name;

        // map this image’s URL to its index inside imagesOnly
        const idxForModal = imageIndexMap.get(url);
        img.addEventListener("click", (e) => {
          e.stopPropagation();
          openModal(imagesOnly.map(i => i.url), idxForModal);
        });

        wrapper.appendChild(img);

      } else if (contentType.startsWith("video/")) {
        const vid = document.createElement("video");
        vid.src = url;
        vid.controls = true;
        vid.preload = "metadata";
        vid.style.width = "100%";
        vid.style.height = "100%";
        vid.style.objectFit = "cover";
        wrapper.appendChild(vid);

      } else if (contentType.startsWith("audio/")) {
        const box = document.createElement("div");
        box.className = "file-card";
        box.innerHTML = `<i class="fas fa-music"></i><span>${name}</span>`;
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

      const delBtn = document.createElement("button");
      delBtn.className = "delete-btn";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteObject(itemRef)
          .then(() => wrapper.remove())
          .catch((err) => console.error("Delete failed:", err));
      });
      wrapper.appendChild(delBtn);

      return wrapper;
    }

    // Render preview tiles
    previewData.forEach((file) => {
      imagesContainer.appendChild(createPreviewCard(file));
    });

    // “+X more”
    if (extraData.length > 0) {
      const more = document.createElement("div");
      more.className = "image-wrapper more-label";
      more.textContent = `+${extraData.length} more`;
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        more.remove();
        extraData.forEach((file) => {
          imagesContainer.appendChild(createPreviewCard(file));
        });
      });
      imagesContainer.appendChild(more);
    }
  })
  .catch((err) => {
    console.error("listAll failed for", innerRef.fullPath, err);
    imagesContainer.innerHTML = `<p class='loading-msg' style="color:red">Failed to load folder.</p>`;
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

//canUpload
async function canUpload(file) {
  const checkQuota = httpsCallable(functionsAU, 'checkQuotaV2');
  const { data } = await checkQuota({ size: file.size });
  if (!data.ok) {
    const usedGB = (data.used / 1e9).toFixed(2);
    const limitGB = (data.limit / 1e9).toFixed(2);
    alert(`Storage limit reached. Used ${usedGB} GB of ${limitGB} GB.`);
    return false;
  }
  return true;
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

    (async () => {
  for (const file of [...files]) {
    // 1) Check quota before each file
    const ok = await canUpload(file);
    if (!ok) continue;

    // 2) Upload with ownerUid metadata so Functions can track usage
    const filePath = `galleries/${userId}/${clientName}/${file.name}`;
    const fileRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(fileRef, file, {
      customMetadata: { ownerUid: currentUserId }
    });

    await new Promise((resolve, reject) => {
      uploadTask.on("state_changed",
        null,
        (error) => reject(error),
        () => resolve()
      );
    });

    completed++;
    if (completed === files.length) {
      uploadStatus.textContent = "All images uploaded!";
      uploadStatus.style.color = "green";
      uploadForm.reset();
      uploadBtn.disabled = false;
      loadGalleryFolders(userId);
      displayStorageUsage(userId);
      updateBillingInfo();
    }
  }
})().catch((error) => {
  console.error("Upload failed:", error);
  uploadStatus.textContent = "Upload failed. Please try again.";
  uploadStatus.style.color = "red";
  uploadBtn.disabled = false;
});
  });
}

// ─────────────────────────────────────────────
// STORAGE TRACKER
// ─────────────────────────────────────────────
async function displayStorageUsage(userId) {
  try {
    const checkQuota = httpsCallable(functionsAU, 'checkQuotaV2');
    const { data } = await checkQuota({ size: 0 });
    const usedMB = (data.used / (1024 * 1024)).toFixed(1);
    const limitMB = (data.limit / (1024 * 1024)).toFixed(0);
    storageUsage.textContent = `${usedMB} MB of ${limitMB} MB used`;
    storageUsage.style.color = data.used / data.limit >= 0.9 ? 'red' : '#333';
  } catch (err) {
    console.error('checkQuota failed:', err.code, err.message);
    storageUsage.textContent = 'Error checking usage.';
  }
}



function createDownloadZipButton(uid, galleryName) {
  const button = document.createElement("button");
  button.className = "cta-button zip-download-btn";
  button.innerHTML = '<i class="fas fa-file-archive" style="margin-right: 6px;"></i>Download ZIP';
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Preparing...";

    const url = `https://us-central1-photogallery-saas.cloudfunctions.net/generateZip?uid=${uid}&folder=${galleryName}`;
    
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("ZIP failed");

      const blob = await res.blob();
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = `${galleryName}.zip`;
      downloadLink.click();

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


