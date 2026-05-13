// js/portal-engine.js
import { db, auth } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const testId = urlParams.get('testId');
const batchId = urlParams.get('batchId');

let testData = null;
let currentQIdx = 0;
let userAnswers = {}; 
let timeRemaining = 0;
let examEndTime = 0; 
let timerInterval = null;
let isSubmitting = false;
let currentUserId = null; 
let sections = []; 

const BACKEND_URL = "https://vidyaplus-backend.vercel.app";
const DASHBOARD_URL = "/"; // 👈 Redirect URL when test finishes or fails

// ==========================================
// 🛡️ ADVANCED ACADEMIC SECURITY MODULE (Updated)
// ==========================================
const SecurityModule = {
    warnings: 0,
    maxWarnings: 5, // 👈 Increased for Mobile Tolerance (Calls/Notifications)
    isActive: false,

    init() {
        this.isActive = true;
        this.applyStrictEnvironment();
        this.monitorVisibility();
        console.log("Secure Assessment Environment Activated.");
    },

    applyStrictEnvironment() {
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('copy', e => e.preventDefault());
        document.addEventListener('cut', e => e.preventDefault());
        document.addEventListener('paste', e => e.preventDefault());
        
        document.addEventListener('keydown', e => {
            if (e.key === 'F12' || 
               (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || 
               (e.ctrlKey && e.key === 'U')) {
                e.preventDefault();
            }

            // ⚡ UX IMPROVEMENT: Keyboard Navigation (JEE CBT Feel)
            if(e.key === 'ArrowRight' && !isSubmitting) window.saveAndNext();
            if(e.key === 'ArrowLeft' && !isSubmitting) window.navigateQ(-1);
        });
    },

    triggerViolation(reason) {
        if (!this.isActive || isSubmitting) return;
        this.warnings++;
        
        if (this.warnings >= this.maxWarnings) {
            alert(`ACADEMIC INTEGRITY VIOLATION\n\nMaximum warnings exceeded (${this.maxWarnings}/${this.maxWarnings}).\nReason: ${reason}\n\nYour assessment is being automatically submitted for administrative review.`);
            autoSubmit();
        } else {
            alert(`WARNING: ACADEMIC INTEGRITY MONITORING\n\nAction detected: ${reason}.\nPlease remain focused on the assessment window. Do not switch tabs or applications. Further violations will result in automatic submission.\n\nWarning ${this.warnings} of ${this.maxWarnings}.`);
        }
    },

    monitorVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !isSubmitting) {
                saveProgressLocally(); // 👈 Emergency save on minimize
                if(this.isActive) this.triggerViolation("Navigated away from the active assessment window");
            }
        });

        window.addEventListener('blur', () => {
            if (this.isActive && !isSubmitting) {
                // 👈 1.5s Delay for mobile notifications & accidental swipes
                setTimeout(() => {
                    if (!document.hasFocus()) {
                        this.triggerViolation("Assessment window lost focus (Tab switch/App switch detected)");
                    }
                }, 1500); 
            }
        });
    }
};
// ==========================================

window.addEventListener('beforeunload', function (e) {
    if (!isSubmitting) {
        e.preventDefault();
        e.returnValue = 'Assessment in progress. Exiting will discard unsaved progress.';
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) { alert("Authentication required. Please initiate a valid session."); window.location.href = DASHBOARD_URL; return; }
    currentUserId = user.uid; 

    if(!testId || !batchId) { alert("Invalid Assessment Session Parameters."); window.location.href = DASHBOARD_URL; return; }

    if(sessionStorage.getItem('submitted_' + testId)) {
        showSuccessScreen("This assessment has already been submitted and concluded.");
        return;
    }

    try {
        const response = await fetch(BACKEND_URL + "/getSecureTest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ testId, batchId })
        });

        if (response.ok) {
            testData = await response.json();
            testData.docId = testId; 
            
            if(!testData.questions || testData.questions.length === 0) {
                alert("Assessment structural error: No questions populated."); window.location.href = DASHBOARD_URL; return;
            }
            initializePortal();
        } else {
            alert("Assessment not found or Authorization Denied."); window.location.href = DASHBOARD_URL;
        }
    } catch (err) { 
        console.error("Fetch error:", err);
        alert("Network Error: Failed to establish secure connection to the assessment server."); window.location.href = DASHBOARD_URL;
    }
});

function saveProgressLocally() {
    if(!testData || !testData.docId || isSubmitting) return;
    const progressState = {
        userAnswers: userAnswers,
        timeRemaining: timeRemaining,
        currentQIdx: currentQIdx
    };
    localStorage.setItem('vp_exam_progress_' + testData.docId, JSON.stringify(progressState));
}

function initializePortal() {
    document.getElementById('exam-title').innerText = testData.title;
    
    const savedState = localStorage.getItem('vp_exam_progress_' + testData.docId);
    if(savedState) {
        try {
            const parsedState = JSON.parse(savedState);
            userAnswers = parsedState.userAnswers || {};
            timeRemaining = parsedState.timeRemaining || (testData.duration * 60);
            currentQIdx = parsedState.currentQIdx || 0;
        } catch(e) {
            timeRemaining = testData.duration * 60; 
        }
    } else {
        timeRemaining = testData.duration * 60;
    }
    
    sections = [...new Set(testData.questions.map(q => q.section || "General"))];
    const selector = document.getElementById('subject-selector');
    selector.innerHTML = '';
    sections.forEach(sec => {
        selector.innerHTML += `<option value="${sec}">${sec}</option>`;
    });

    SecurityModule.init(); 
    startTimer();
    renderQuestion();
    renderPalette();
}

function startTimer() {
    examEndTime = Date.now() + (timeRemaining * 1000);

    timerInterval = setInterval(() => {
        if(isSubmitting) {
            clearInterval(timerInterval);
            return;
        }

        const now = Date.now();
        timeRemaining = Math.max(0, Math.floor((examEndTime - now) / 1000));

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            autoSubmit(); 
            return;
        }
        
        const hrs = Math.floor(timeRemaining / 3600);
        const mins = Math.floor((timeRemaining % 3600) / 60);
        const secs = timeRemaining % 60;
        
        document.getElementById('timer-val').innerText = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if(timeRemaining < 300) {
            document.getElementById('timer-val').style.color = '#ef4444';
        }

        if (timeRemaining % 5 === 0) saveProgressLocally();

    }, 1000);
}

window.jumpToSubject = (secName) => {
    const firstQOfSec = testData.questions.findIndex(q => (q.section || "General") === secName);
    if(firstQOfSec !== -1) {
        currentQIdx = firstQOfSec;
        saveProgressLocally(); 
        renderQuestion();
    }
};

window.renderQuestion = () => {
    const q = testData.questions[currentQIdx];
    if(!q) return;

    document.getElementById('q-meta').innerText = `Question ${currentQIdx + 1} of ${testData.questions.length}`;
    
    let tText = "Single Correct";
    if(q.type === 'multiple') tText = "Multiple Correct";
    if(q.type === 'numerical') tText = "Numerical";
    document.getElementById('q-type-badge').innerText = `(${tText})`;

    document.getElementById('subject-selector').value = q.section || "General";
    
    const pM = q.marks?.correct || 4;
    const nM = q.marks?.incorrect || 1;
    document.getElementById('q-marks').innerText = `[+${pM}, -${nM}]`;
    
    document.getElementById('q-text').textContent = q.questionText || "Missing content";
    
    const optContainer = document.getElementById('q-options');
    optContainer.innerHTML = '';
    
    const saved = userAnswers[q.id] || { answer: [] };

    if (q.type === 'single' || q.type === 'multiple') {
        const options = q.options || [];
        options.forEach((opt, idx) => {
            const isSelected = saved.answer.includes(idx);
            
            const optRow = document.createElement('div');
            optRow.className = `option-row ${isSelected ? 'selected' : ''}`;
            optRow.onclick = () => selectOption(idx, q.type);
            
            const radioSpan = document.createElement('span');
            radioSpan.className = 'opt-radio';
            
            const textDiv = document.createElement('div');
            textDiv.style.cssText = 'flex: 1; font-weight: 500;';
            textDiv.textContent = opt; 

            optRow.appendChild(radioSpan);
            optRow.appendChild(textDiv);
            optContainer.appendChild(optRow);
        });
    } else if (q.type === 'numerical') {
        optContainer.innerHTML = `
            <div style="padding: 10px 0;">
                <input type="number" step="any" class="num-input" id="num-ans" 
                       value="${saved.answer[0] !== undefined ? saved.answer[0] : ''}" 
                       oninput="saveNumerical(this.value)" placeholder="Enter precise numerical value">
            </div>`;
    }
    updatePaletteUI();
};

window.selectOption = (idx, type) => {
    const qId = testData.questions[currentQIdx].id;
    if (!userAnswers[qId]) userAnswers[qId] = { answer: [], status: 'visited' };

    if (type === 'single') {
        userAnswers[qId].answer = [idx];
    } else {
        const pos = userAnswers[qId].answer.indexOf(idx);
        if (pos > -1) userAnswers[qId].answer.splice(pos, 1);
        else userAnswers[qId].answer.push(idx);
    }
    
    const optContainer = document.getElementById('q-options');
    if (optContainer) {
        const optionRows = optContainer.children;
        for (let i = 0; i < optionRows.length; i++) {
            if(optionRows[i].classList.contains('option-row')) {
                if (userAnswers[qId].answer.includes(i)) {
                    optionRows[i].classList.add('selected');
                } else {
                    optionRows[i].classList.remove('selected');
                }
            }
        }
    }
    updatePaletteUI();
};

// ⚡ CRITICAL BUG FIXED: NaN Input filtering
window.saveNumerical = (val) => {
    const qId = testData.questions[currentQIdx].id;
    const num = parseFloat(val);
    
    if(val === "" || isNaN(num)) {
        delete userAnswers[qId];
    } else {
        userAnswers[qId] = { answer: [num], status: 'visited' };
    }
};

window.saveAndNext = () => {
    const qId = testData.questions[currentQIdx].id;
    if (userAnswers[qId] && userAnswers[qId].answer.length > 0) {
        userAnswers[qId].status = 'answered';
    } else if (!userAnswers[qId]) {
        userAnswers[qId] = { answer: [], status: 'visited' };
    }
    saveProgressLocally(); 
    navigateQ(1);
};

window.markForReview = () => {
    const qId = testData.questions[currentQIdx].id;
    if (!userAnswers[qId]) userAnswers[qId] = { answer: [], status: 'review' };
    else userAnswers[qId].status = 'review';
    saveProgressLocally();
    navigateQ(1);
};

window.clearResponse = () => {
    const qId = testData.questions[currentQIdx].id;
    delete userAnswers[qId];
    
    const optContainer = document.getElementById('q-options');
    if (optContainer) {
        const optionRows = optContainer.children;
        for (let i = 0; i < optionRows.length; i++) {
            if(optionRows[i].classList.contains('option-row')) {
                optionRows[i].classList.remove('selected');
            }
        }
    }
    
    const numInput = document.getElementById('num-ans');
    if (numInput) numInput.value = '';
    
    updatePaletteUI();
};

window.navigateQ = (step) => {
    const newIdx = currentQIdx + step;
    if (newIdx >= 0 && newIdx < testData.questions.length) {
        currentQIdx = newIdx;
        renderQuestion();
    }
};

window.jumpToQ = (idx) => {
    currentQIdx = idx;
    renderQuestion();
    if(window.innerWidth < 900) {
        document.getElementById('p-panel').classList.remove('open');
        document.getElementById('palette-overlay').classList.remove('open');
    }
};

function renderPalette() {
    const container = document.getElementById('palette-container');
    container.innerHTML = '';
    testData.questions.forEach((q, idx) => {
        container.innerHTML += `<button class="p-btn" id="p-btn-${idx}" onclick="jumpToQ(${idx})">${idx + 1}</button>`;
    });
}

function updatePaletteUI() {
    testData.questions.forEach((q, idx) => {
        const btn = document.getElementById(`p-btn-${idx}`);
        if(!btn) return;
        const state = userAnswers[q.id];
        
        btn.className = 'p-btn';
        if (idx === currentQIdx) btn.classList.add('current');
        
        if (state) {
            if (state.status === 'answered') btn.classList.add('answered');
            else if (state.status === 'review') btn.classList.add('review');
            else if (state.status === 'visited') btn.classList.add('visited');
        }
    });
}

window.confirmSubmit = () => {
    if(isSubmitting) return;
    if (confirm("Confirm Final Submission? Once submitted, assessment responses cannot be modified.")) {
        autoSubmit();
    }
};

async function autoSubmit() {
    if(isSubmitting) return;
    isSubmitting = true;
    SecurityModule.isActive = false; 
    clearInterval(timerInterval);
    
    document.body.innerHTML = `
        <div style="height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #f8fafc;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 3rem; color: #1d4ed8; margin-bottom: 20px;"></i>
            <h2 style="color: #0f172a; font-weight: 700;">Transmitting Responses Securely...</h2>
        </div>
    `;

    const safeUserAnswers = JSON.parse(JSON.stringify(userAnswers)); 
    const timeSpent = (testData.duration * 60) - timeRemaining;

    try {
        const response = await fetch(BACKEND_URL + "/submitAssessment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                testId: testId, 
                batchId: batchId,
                userAnswers: safeUserAnswers,
                timeSpent: timeSpent,
                uid: currentUserId
            })
        });

        if (!response.ok) throw new Error("Server communication failure");
        
        await response.json();
        
        sessionStorage.setItem('submitted_' + testData.docId, 'true'); 
        localStorage.removeItem('vp_exam_progress_' + testData.docId);
        
        showSuccessScreen("Assessment data successfully received and verified by the evaluation server.");
        
    } catch (err) { 
        console.error("Submission Error:", err); 
        document.body.innerHTML = `
            <div style="text-align:center; padding: 50px;">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 3rem; margin-bottom:15px;"></i>
                <h3 style="color: #0f172a; margin-bottom: 10px;">Network Timeout</h3>
                <p>Failed to establish a secure connection for submission. Please check your network stability.</p>
                <button onclick="location.reload()" style="margin-top:20px; padding: 10px 20px; background: #1d4ed8; color: white; border: none; border-radius: 4px; font-weight: 600; cursor:pointer;">Retry Transmission</button>
            </div>
        `;
    }
}

function showSuccessScreen(msg) {
    // ⚡ BUG FIXED: window.close() removed. Replaced with redirection to Dashboard
    document.body.innerHTML = `
        <div style="height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #f8fafc; font-family: 'Inter', sans-serif;">
            <div style="background: white; padding: 40px; border-radius: 12px; border: 1px solid #cbd5e1; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 400px; width: 90%;">
                <i class="fas fa-shield-check" style="color: #16a34a; font-size: 4rem; margin-bottom: 20px;"></i>
                <h2 style="color: #0f172a; font-weight: 800; font-size: 1.5rem; margin-bottom: 10px;">Assessment Concluded</h2>
                <p style="color: #475569; font-size: 0.9rem; margin-bottom: 25px; line-height: 1.6;">${msg}<br>You may now safely exit this screen and return to your dashboard.</p>
                <button onclick="window.location.href='${DASHBOARD_URL}'" style="width: 100%; padding: 12px; background: #0f172a; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 1rem; cursor: pointer; transition: 0.2s;">Return to Dashboard</button>
            </div>
        </div>
    `;
}
