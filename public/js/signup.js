import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ✅ Your updated Firebase config (photogallery-saas)
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

// Form logic
const signupForm = document.getElementById("signup-form");
const authMessage = document.getElementById("authMessage");

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCred.user, { displayName: name });

    authMessage.textContent = "Account created! Redirecting...";
    authMessage.style.color = "green";

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1500);
  } catch (error) {
    console.error("Signup error:", error.message);
    authMessage.textContent = error.message;
    authMessage.style.color = "red";
  }
});
