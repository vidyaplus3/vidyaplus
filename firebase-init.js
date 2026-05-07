// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyB6s4SQloHdaPU8EVvkrrYpYvUdahsOtI4",
    authDomain: "vidyaplus-d9c3b.firebaseapp.com",
    projectId: "vidyaplus-d9c3b",
    storageBucket: "vidyaplus-d9c3b.firebasestorage.app",
    messagingSenderId: "492916889178",
    appId: "1:492916889178:web:a3d3f3737b1236167caa63",
    measurementId: "G-Q9XL40BW87"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Export taaki baaki files isko use kar sakein
export { app, auth };

