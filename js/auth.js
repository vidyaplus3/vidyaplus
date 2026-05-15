// js/auth.js
import { auth, db } from './firebase-init.js'; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// 🚨 NAYA IMPORT: Subcollection se data lane ke liye collection aur getDocs chahiye
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; 

// Global State Object
export const AppState = {
    currentUser: null,
    enrolledBatches: [],
    currentBatchId: localStorage.getItem('vp_batch') || null,
    currentSubject: localStorage.getItem('vp_subject') || null,
    currentChapter: localStorage.getItem('vp_chapter') || null,
    materialsTree: {} 
};

// Auth Initialize karne ka function
export const initAuth = (onSuccessCallback) => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            AppState.currentUser = user;
            const name = user.displayName || user.email.split('@')[0];
            
            // UI elements ko update karna
            const userNameEl = document.getElementById('userName');
            const userIconEl = document.getElementById('userIcon');
            if(userNameEl) userNameEl.innerText = name;
            if(userIconEl) userIconEl.innerText = name.charAt(0).toUpperCase();

            // Naye secure subcollection se Batches fetch karo
            await fetchUserBatches(user.uid, onSuccessCallback);
        } else { 
            window.location.replace("login.html"); 
        }
    });
};

// 🚨 NAYA SECURE FETCH LOGIC
const fetchUserBatches = async (uid, callback) => {
    try {
        // Direct array read karne ki jagah ab hum enrollments subcollection ko read kar rahe hain
        const enrollmentsSnap = await getDocs(collection(db, "users", uid, "enrollments"));
        
        AppState.enrolledBatches = [];
        
        // Har document ka ID hi batchId hai
        enrollmentsSnap.forEach(doc => {
            AppState.enrolledBatches.push(doc.id);
        });
        
        // Agar koi batch nahi kharida hai, toh Explore page pe bhejo
        if (AppState.enrolledBatches.length === 0) { 
            window.location.replace('explore.html'); 
            return; 
        }
        
        // Data aane ke baad next function trigger karo
        if (typeof callback === 'function') {
            callback(AppState.enrolledBatches);
        }
    } catch (error) { 
        console.error("Auth Error:", error); 
    }
};
