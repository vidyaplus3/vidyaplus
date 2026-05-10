// auth.js
import { auth, db } from './firebase-init.js'; // Tumhari existing file se import
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Global variables ki jagah ek Central State Object
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

            // Batches fetch karo
            await fetchUserBatches(user.uid, onSuccessCallback);
        } else { 
            window.location.replace("login.html"); 
        }
    });
};

const fetchUserBatches = async (uid, callback) => {
    try {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) {
            AppState.enrolledBatches = userSnap.data().enrolledBatches || [];
            
            if (AppState.enrolledBatches.length === 0) { 
                window.location.replace('explore.html'); 
                return; 
            }
            
            // Data aane ke baad next function trigger karo
            if (typeof callback === 'function') {
                callback(AppState.enrolledBatches);
            }
        }
    } catch (error) { 
        console.error("Auth Error:", error); 
    }
};
