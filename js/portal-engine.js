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
const DASHBOARD_URL = "/study#tests"; 

// ==========================================
// 🕵️ TELEMETRY ENGINE (The Ultimate Data Tracker)
// ==========================================
const Telemetry = {
    questionEntryTime: 0,
    systemLogs: [],

    initQuestionRecord(qId) {
        if (!userAnswers[qId]) {
            userAnswers[qId] = { 
                answer: [], 
                status: 'visited', 
                timeSpent: 0, // Total time spent in milliseconds
                visits: 0,    // How many times user saw this question
                actions: []   // Tracks every click, change, and clear
            };
        }
    },

    recordEntry() {
        this.questionEntryTime = Date.now();
        const qId = testData.questions[currentQIdx].id;
        this.initQuestionRecord(qId);
        userAnswers[qId].visits += 1;
    },

    recordExit() {
        if (this.questionEntryTime === 0) return;
        const qId = testData.questions[currentQIdx].id;
        const timeSpentNow = Date.now() - this.questionEntryTime;
        
        this.initQuestionRecord(qId);
        userAnswers[qId].timeSpent += timeSpentNow;
        this.questionEntryTime = 0; // Reset for next
    },

    logAction(actionType, value = null) {
        const qId = testData.questions[currentQIdx].id;
        this.initQuestionRecord(qId);
        userAnswers[qId].actions.push({
            type: actionType,
            val: value,
            timestamp: Date.now()
        });
    },

    logSystemEvent(eventName) {
        this.systemLogs.push({
            event: eventName,
            timestamp: Date.now()
        });
    }
};
// ==========================================

// ==========================================
// 🛡️ ADVANCED ACADEMIC SECURITY MODULE
// ==========================================
const SecurityModule = {
    warnings: 0,
    maxWarnings: 5, 
    isActive: false,

    init() {
        this.isActive = true;
        this.applyStrictEnvironment();
        this.monitorVisibility();
        console.log("Secure Assessment & Telemetry Activated.");
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

            if (e.target.tagName !== 'INPUT' && !isSubmitting) {
                if(e.key === 'ArrowRight') window.saveAndNext();
                if(e.key === 'ArrowLeft') window.navigateQ(-1);
            }
        });
    },

    triggerViolation(reason) {
        if (!this.isActive || isSubmitting) return;
        this.warnings++;
        Telemetry.logSystemEvent(`Violation: ${reason} (Warning ${this.warnings})`); 
        
        if (this.warnings >= this.maxWarnings) {
            alert(`ACADEMIC INTEGRITY VIOLATION\n\nMaximum warnings exceeded (${this.maxWarnings}/${this.maxWarnings}).\nReason: ${reason}\n\nYour assessment is being automatically submitted for administrative review.`);
            autoSubmit();
        } else {
            alert(`WARNING: ACADEMIC INTEGRITY MONITORING\n\nAction detected: ${reason}.\nPlease remain focused on the assessment window.\n\nWarning ${this.warnings} of ${this.maxWarnings}.`);
        }
    },

    monitorVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !isSubmitting) {
                Telemetry.logSystemEvent("Tab Minimized/Hidden"); 
                saveProgressLocally(); 
                if(this.isActive) this.triggerViolation("Navigated away from the active assessment window");
            } else if (!document.hidden) {
                Telemetry.logSystemEvent("Tab Restored"); 
            }
        });

        window.addEventListener('blur', () => {
            if (this.isActive && !isSubmitting) {
                Telemetry.logSystemEvent("Window Blur (Focus Lost)"); 
                setTimeout(() => {
                    if (!document.hasFocus() && !document.hidden) {
                        this.triggerViolation("Assessment window lost focus");
                    }
                }, 2000); 
            }
        });
        
        window.addEventListener('focus', () => {
             if (this.isActive && !isSubmitting) Telemetry.logSystemEvent("Window Focus Restored");
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
    if (!user) { alert("Authentication failed. Please log in again."); window.close(); return; }
    currentUserId = user.uid; 

    if(!testId || !batchId) { alert("Invalid Assessment Session."); window.close(); return; }

    if(sessionStorage.getItem('submitted_' + testId)) {
        showSuccessScreen("Assessment already submitted.");
        return;
    }

    try {
        // 🚨 Token nikalna aur headers me bhejna
        const idToken = await user.getIdToken();

        const response = await fetch(BACKEND_URL + "/getSecureTest", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}` 
            },
            body: JSON.stringify({ testId, batchId })
        });

        if (response.ok) {
            testData = await response.json();
            testData.docId = testId; 
            
            if(!testData.questions || testData.questions.length === 0) {
                alert("Error: Assessment contains no questions."); window.close(); return;
            }
            initializePortal();
        } else {
            alert("Assessment not found or Access Denied."); window.close();
        }
    } catch (err) { 
        console.error("Fetch error:", err);
        alert("Network Error: Failed to load secure assessment."); window.close();
    }
});

function saveProgressLocally() {
    if(!testData || !testData.docId || isSubmitting) return;
    const progressState = {
        userAnswers: userAnswers,
        timeRemaining: timeRemaining,
        currentQIdx: currentQIdx,
        systemLogs: Telemetry.systemLogs 
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
            Telemetry.systemLogs = parsedState.systemLogs || [];
            Telemetry.logSystemEvent("Test Resumed from LocalStorage");
        } catch(e) {
            timeRemaining = testData.duration * 60; 
        }
    } else {
        timeRemaining = testData.duration * 60;
        Telemetry.logSystemEvent("Test Started");
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
    Telemetry.recordExit(); 
    const firstQOfSec = testData.questions.findIndex(q => (q.section || "General") === secName);
    if(firstQOfSec !== -1) {
        Telemetry.logSystemEvent(`Jumped to Subject: ${secName}`);
        currentQIdx = firstQOfSec;
        saveProgressLocally(); 
        renderQuestion();
    }
};

window.renderQuestion = () => {
    const q = testData.questions[currentQIdx];
    if(!q) return;

    Telemetry.recordEntry(); 

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
    
    Telemetry.initQuestionRecord(q.id); 
    const saved = userAnswers[q.id];

    if (q.type === 'single' || q.type === 'multiple') {
        const options = q.options || [];
        const frag = document.createDocumentFragment(); 
        
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
            frag.appendChild(optRow);
        });
        optContainer.appendChild(frag);
        
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
    Telemetry.initQuestionRecord(qId);
    Telemetry.logAction('select_option', idx); 

    if (type === 'single') {
        userAnswers[qId].answer = [idx];
    } else {
        const pos = userAnswers[qId].answer.indexOf(idx);
        if (pos > -1) {
            userAnswers[qId].answer.splice(pos, 1);
            Telemetry.logAction('deselect_option', idx); 
        } else {
            userAnswers[qId].answer.push(idx);
        }
    }
    
    userAnswers[qId].status = 'visited'; 
    
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

window.saveNumerical = (val) => {
    const qId = testData.questions[currentQIdx].id;
    const num = parseFloat(val);
    
    Telemetry.initQuestionRecord(qId);
    Telemetry.logAction('numerical_input', val); 
    
    if(val.trim() === "" || isNaN(num)) {
        delete userAnswers[qId].answer;
        userAnswers[qId].answer = [];
    } else {
        userAnswers[qId].answer = [num];
        userAnswers[qId].status = 'visited';
    }
};

window.saveAndNext = () => {
    Telemetry.recordExit(); 
    const qId = testData.questions[currentQIdx].id;
    Telemetry.initQuestionRecord(qId);
    
    if (userAnswers[qId].answer && userAnswers[qId].answer.length > 0) {
        userAnswers[qId].status = 'answered';
        Telemetry.logAction('status_change', 'answered');
    } else {
        userAnswers[qId].status = 'visited';
    }
    saveProgressLocally(); 
    navigateQ(1);
};

window.markForReview = () => {
    Telemetry.recordExit(); 
    const qId = testData.questions[currentQIdx].id;
    Telemetry.initQuestionRecord(qId);
    
    userAnswers[qId].status = 'review';
    Telemetry.logAction('status_change', 'review');
    
    saveProgressLocally();
    navigateQ(1);
};

window.clearResponse = () => {
    const qId = testData.questions[currentQIdx].id;
    Telemetry.initQuestionRecord(qId);
    Telemetry.logAction('clear_response'); 
    
    userAnswers[qId].answer = [];
    userAnswers[qId].status = 'visited';
    
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
        if(step !== 0) Telemetry.recordExit(); 
        currentQIdx = newIdx;
        renderQuestion();
    }
};

window.jumpToQ = (idx) => {
    Telemetry.recordExit(); 
    currentQIdx = idx;
    renderQuestion();
    if(window.innerWidth < 900) {
        const panel = document.getElementById('p-panel');
        const overlay = document.getElementById('palette-overlay');
        if(panel) panel.classList.remove('open');
        if(overlay) overlay.classList.remove('open');
    }
};

function renderPalette() {
    const container = document.getElementById('palette-container');
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    
    testData.questions.forEach((q, idx) => {
        const btn = document.createElement('button');
        btn.className = 'p-btn';
        btn.id = `p-btn-${idx}`;
        btn.textContent = idx + 1;
        btn.onclick = () => jumpToQ(idx);
        frag.appendChild(btn);
    });
    
    container.appendChild(frag);
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
    
    Telemetry.recordExit(); 
    Telemetry.logSystemEvent("Final Submit Triggered");

    document.body.innerHTML = `
        <div style="height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #f8fafc;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 3rem; color: #1d4ed8; margin-bottom: 20px;"></i>
            <h2 style="color: #0f172a; font-weight: 700;">Transmitting Analytics & Responses...</h2>
            <p style="color: #64748b; font-size: 0.9rem; margin-top: 10px;">Encrypting high-fidelity telemetry data.</p>
        </div>
    `;

    const safeUserAnswers = JSON.parse(JSON.stringify(userAnswers)); 
    const timeSpent = (testData.duration * 60) - timeRemaining;

    try {
        const idToken = await auth.currentUser.getIdToken();

        const response = await fetch(BACKEND_URL + "/submitAssessment", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}` 
            },
            // 🚨 FIX: Yahan se uid nikal diya gaya hai! Ab backend sirf JWT par rely karega
            body: JSON.stringify({
                testId: testId, 
                batchId: batchId,
                userAnswers: safeUserAnswers, 
                timeSpent: timeSpent,
                systemTelemetry: Telemetry.systemLogs 
            })
        });

        if (!response.ok) throw new Error("Server communication failure");
        
        await response.json();
        
        sessionStorage.setItem('submitted_' + testData.docId, 'true'); 
        localStorage.removeItem('vp_exam_progress_' + testData.docId);
        
        showSuccessScreen("Assessment data and behavioral telemetry successfully securely uploaded.");
        
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
    document.body.innerHTML = `
        <div style="height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #f8fafc; font-family: 'Inter', sans-serif;">
            <div style="background: white; padding: 40px; border-radius: 12px; border: 1px solid #cbd5e1; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 400px; width: 90%;">
                <i class="fas fa-shield-check" style="color: #16a34a; font-size: 4rem; margin-bottom: 20px;"></i>
                <h2 style="color: #0f172a; font-weight: 800; font-size: 1.5rem; margin-bottom: 10px;">Assessment Concluded</h2>
                <p style="color: #475569; font-size: 0.9rem; margin-bottom: 25px; line-height: 1.6;">${msg}<br>You may now close this tab and return to the main dashboard.</p>
                <button onclick="window.close()" style="width: 100%; padding: 12px; background: #0f172a; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 1rem; cursor: pointer; transition: 0.2s;">Close Tab</button>
            </div>
        </div>
    `;
}
