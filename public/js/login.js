import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ✅ Firebase Config
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

// 🔐 Elements
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const authMessage = document.getElementById("authMessage");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");

// 🔐 Login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    authMessage.textContent = "Login successful! Redirecting...";
    authMessage.style.color = "green";

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1000);
  } catch (error) {
    authMessage.textContent = error.message;
    authMessage.style.color = "red";
  }
});

// Forgot Password Logic
const resetModal = document.getElementById("resetConfirmationModal");
const closeResetModalBtn = document.getElementById("closeResetModalBtn");

// Forgot Password
forgotPasswordLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();

  if (!email) {
    authMessage.textContent = "Please enter your email first.";
    authMessage.style.color = "red";
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    resetModal.style.display = "flex";
  } catch (error) {
    console.error(error);
    authMessage.textContent = "Error: " + error.message;
    authMessage.style.color = "red";
  }
});

// Modal close
closeResetModalBtn.addEventListener("click", () => {
  resetModal.style.display = "none";
});

resetModal.addEventListener("click", (e) => {
  if (e.target === resetModal) {
    resetModal.style.display = "none";
  }
});