// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js"; // 🔥 NAYA: Storage import

const firebaseConfig = {
    apiKey: "AIzaSyB6s4SQloHdaPU8EVvkrrYpYvUdahsOtI4",
    authDomain: "vidyaplus-d9c3b.firebaseapp.com",
    projectId: "vidyaplus-d9c3b",
    storageBucket: "vidyaplus-d9c3b.firebasestorage.app",
    messagingSenderId: "492916889178",
    appId: "1:492916889178:web:a3d3f3737b1236167caa63",
    measurementId: "G-Q9XL40BW87"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // 🔥 NAYA: Storage start

// Export 'storage' taaki hum video upload kar sakein
export { app, auth, db, storage };
