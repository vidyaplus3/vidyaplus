// js/analytics/engine.js

import { db, auth } from '../firebase-init.js'; // Tumhara existing firebase connection
import { doc, getDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// 1. ENGINE CONFIGURATION & STATE
// ==========================================
const CONFIG = {
    SYNC_INTERVAL_MS: 5 * 60 * 1000, // Har 5 minute mein Firebase par sync hoga
    MAX_SYNC_CAP_SEC: 310,           // Anti-Cheat: Ek baar mein 310 sec se zyada sync nahi hoga (5 mins + 10 sec buffer)
    STREAK_TARGET_SEC: 600           // 10 Mins (600 sec) par streak valid ho jayegi
};

const State = {
    uid: null,
    pendingSeconds: 0,        // Kitne seconds Firebase par bhejne baaki hain
    localDailySeconds: 0,     // Aaj ka total focus time
    isTracking: false,
    intervalId: null,
    syncTimerId: null
};

// ==========================================
// 2. CORE TRACKING LOGIC (The Stopwatch)
// ==========================================
const startStopwatch = () => {
    if (State.isTracking) return;
    State.isTracking = true;
    
    // Har 1 second mein local time badhao
    State.intervalId = setInterval(() => {
        State.pendingSeconds += 1;
        State.localDailySeconds += 1;
        
        // LocalStorage backup (Agar tab crash ho jaye)
        localStorage.setItem('vp_pending_sec', State.pendingSeconds);
        localStorage.setItem('vp_daily_sec', State.localDailySeconds);

        // Check for Streak Milestone (Silent Execution)
        if (State.localDailySeconds === CONFIG.STREAK_TARGET_SEC) {
            triggerStreakAward();
        }
    }, 1000);
};

const pauseStopwatch = () => {
    if (!State.isTracking) return;
    State.isTracking = false;
    clearInterval(State.intervalId);
};

// ==========================================
// 3. SECURE FIREBASE BATCHED SYNC
// ==========================================
const syncToCloud = async () => {
    if (!State.uid || State.pendingSeconds <= 0) return;

    // Anti-Cheat Protection
    let secondsToSync = State.pendingSeconds;
    if (secondsToSync > CONFIG.MAX_SYNC_CAP_SEC) {
        console.warn("VidyaAnalytics: Suspicious time jump detected. Capping to maximum allowed.");
        secondsToSync = CONFIG.MAX_SYNC_CAP_SEC;
    }

    const payload = {
        totalWatchTimeSeconds: increment(secondsToSync),
        dailyWatchTimeSeconds: increment(secondsToSync),
        lastPingDate: new Date().toISOString()
    };

    // Reset pending immediately to avoid double sync while network request is flying
    State.pendingSeconds = 0; 
    localStorage.setItem('vp_pending_sec', 0);

    try {
        const userRef = doc(db, "users", State.uid);
        await updateDoc(userRef, payload);
        console.log(`[Telemetry] Synced ${secondsToSync}s successfully. Writes optimized.`);
    } catch (error) {
        console.error("[Telemetry] Sync Failed. Reverting pending seconds.", error);
        // Agar net chala gaya, toh seconds wapas pending mein daal do taaki data loss na ho
        State.pendingSeconds += secondsToSync;
    }
};

const triggerStreakAward = async () => {
    if (!State.uid) return;
    const todayStr = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    try {
        const userRef = doc(db, "users", State.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.lastActiveDate !== todayStr) {
                // Pehli baar 10 minute pure hue aaj ke din
                await updateDoc(userRef, {
                    streak: increment(1),
                    lastActiveDate: todayStr
                });
                console.log("🔥 System: Active Streak Awarded!");
            }
        }
    } catch (error) {
        console.error("Streak evaluation failed.", error);
    }
};

// ==========================================
// 4. AUTONOMOUS LIFECYCLE MANAGEMENT
// ==========================================

// Recover lost data from crash
const recoverLocalState = () => {
    const savedPending = parseInt(localStorage.getItem('vp_pending_sec')) || 0;
    const savedDaily = parseInt(localStorage.getItem('vp_daily_sec')) || 0;
    
    // Check if it's a new day, reset daily tracker
    const savedDate = localStorage.getItem('vp_active_date');
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (savedDate !== todayStr) {
        State.localDailySeconds = 0;
        localStorage.setItem('vp_daily_sec', 0);
        localStorage.setItem('vp_active_date', todayStr);
    } else {
        State.localDailySeconds = savedDaily;
    }

    if (savedPending > 0) {
        State.pendingSeconds = savedPending;
        syncToCloud(); // Immediately sync recovered time
    }
};

// Browser Event Listeners
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        pauseStopwatch();
        syncToCloud(); // Backup jab user app minimize kare
    } else {
        // Sirf tab resume hoga agar explicitly start kiya gaya tha
        // (Iska control Player.js ke paas hoga)
    }
});

window.addEventListener("beforeunload", () => {
    pauseStopwatch();
    if (State.pendingSeconds > 0) syncToCloud();
});

// ==========================================
// 5. GLOBAL EXPORT (Isolated Linkage)
// ==========================================
// Hum ek global object bana rahe hain, taaki tumhara video player ya baaki website 
// bina is file ko modify kiye ise commands de sake.

window.VidyaAnalytics = {
    startSession: () => {
        if(!State.uid) return;
        startStopwatch();
        if(!State.syncTimerId) {
            State.syncTimerId = setInterval(syncToCloud, CONFIG.SYNC_INTERVAL_MS);
        }
    },
    pauseSession: () => {
        pauseStopwatch();
        syncToCloud();
    },
    forceSync: () => syncToCloud()
};

// Engine Initialization
onAuthStateChanged(auth, (user) => {
    if (user) {
        State.uid = user.uid;
        recoverLocalState();
    } else {
        State.uid = null;
        pauseStopwatch();
        if(State.syncTimerId) clearInterval(State.syncTimerId);
    }
});
