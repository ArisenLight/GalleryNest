// public/js/signup.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

// Firebase config
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
// Important: your callables are in australia-southeast1
const functionsAU = getFunctions(app, "australia-southeast1");

const signupForm = document.getElementById("signup-form");
const authMessage = document.getElementById("authMessage");

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // Default to free if nothing was chosen on the pricing page
  const selectedPlan = (localStorage.getItem("gn_selected_plan") || "free").toLowerCase();

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    // Optional: clear the saved plan to avoid stale values later
    // localStorage.removeItem("gn_selected_plan");

    if (selectedPlan === "free") {
      authMessage.textContent = "Account created. Redirecting to your dashboard...";
      authMessage.style.color = "green";
      setTimeout(() => { window.location.href = "dashboard.html"; }, 900);
      return;
    }

    // Paid plan path: create Stripe Checkout session via Gen 2 callable
    authMessage.textContent = "Account created. Opening secure checkout...";
    authMessage.style.color = "green";

    const createCheckout = httpsCallable(functionsAU, "createCheckoutSessionV2");
    const { data } = await createCheckout({ plan: selectedPlan });

    if (data && data.url) {
      window.location.assign(data.url);
      return;
    }

    // Fallback if backend returns no url
    throw new Error("Checkout session could not be created.");
  } catch (err) {
    console.error("Signup or checkout error:", err);
    authMessage.textContent = "Signup complete, but checkout failed. You can start your trial from the dashboard.";
    authMessage.style.color = "red";
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);
  }
});
