// js/portal-engine.js
import { db, auth } from './firebase-init.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const testId = urlParams.get('testId');
const batchId = urlParams.get('batchId');

let testData = null;
let currentQIdx = 0;
let userAnswers = {}; 
let timeRemaining = 0;
let timerInterval = null;
let isSubmitting = false;
let currentUserId = null; 
let sections = []; 

window.addEventListener('beforeunload', function (e) {
    if (!isSubmitting) {
        e.preventDefault();
        e.returnValue = 'Are you sure you want to leave? Your progress is saved automatically.';
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
        const testSnap = await getDoc(doc(db, "batches", batchId, "materials", testId));
        if (testSnap.exists()) {
            testData = testSnap.data();
            testData.docId = testSnap.id;
            
            if(!testData.questions || testData.questions.length === 0) {
                alert("Error: Assessment contains no questions."); window.close(); return;
            }
            initializePortal();
        } else {
            alert("Assessment not found."); window.close();
        }
    } catch (err) { 
        alert("Network Error: Failed to load assessment."); window.close();
    }
});

// 🚨 AUTO-SAVE SYSTEM: LocalStorage me data save karne ka function
function saveProgressLocally() {
    if(!testData || !testData.docId) return;
    const progressState = {
        userAnswers: userAnswers,
        timeRemaining: timeRemaining,
        currentQIdx: currentQIdx
    };
    localStorage.setItem('vp_exam_progress_' + testData.docId, JSON.stringify(progressState));
}

function initializePortal() {
    document.getElementById('exam-title').innerText = testData.title;
    
    // 🚨 AUTO-RESUME SYSTEM: Check if previous progress exists
    const savedState = localStorage.getItem('vp_exam_progress_' + testData.docId);
    if(savedState) {
        try {
            const parsedState = JSON.parse(savedState);
            userAnswers = parsedState.userAnswers || {};
            timeRemaining = parsedState.timeRemaining || (testData.duration * 60);
            currentQIdx = parsedState.currentQIdx || 0;
            console.log("Exam Resumed from saved state!");
        } catch(e) {
            timeRemaining = testData.duration * 60; // Fallback
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

    startTimer();
    renderQuestion();
    renderPalette();
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            autoSubmit(); 
            return;
        }
        timeRemaining--;
        const hrs = Math.floor(timeRemaining / 3600);
        const mins = Math.floor((timeRemaining % 3600) / 60);
        const secs = timeRemaining % 60;
        
        document.getElementById('timer-val').innerText = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if(timeRemaining < 300) {
            document.getElementById('timer-val').style.color = '#ef4444';
        }

        // Har second timer tick hone par background me save karo
        saveProgressLocally();
    }, 1000);
}

window.jumpToSubject = (secName) => {
    const firstQOfSec = testData.questions.findIndex(q => (q.section || "General") === secName);
    if(firstQOfSec !== -1) {
        currentQIdx = firstQOfSec;
        saveProgressLocally(); // 🚨 Save Progress
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
    
    document.getElementById('q-text').innerText = q.questionText || "Missing content";
    
    const optContainer = document.getElementById('q-options');
    optContainer.innerHTML = '';
    
    const saved = userAnswers[q.id] || { answer: [] };

    if (q.type === 'single' || q.type === 'multiple') {
        const options = q.options || [];
        options.forEach((opt, idx) => {
            const isSelected = saved.answer.includes(idx);
            optContainer.innerHTML += `
                <div class="option-row ${isSelected ? 'selected' : ''}" onclick="selectOption(${idx}, '${q.type}')">
                    <span class="opt-radio"></span>
                    <div style="flex: 1; font-weight: 500;">${opt}</div>
                </div>`;
        });
    } else if (q.type === 'numerical') {
        optContainer.innerHTML = `
            <div style="padding: 10px 0;">
                <input type="number" step="any" class="num-input" id="num-ans" 
                       value="${saved.answer[0] !== undefined ? saved.answer[0] : ''}" 
                       oninput="saveNumerical(this.value)" placeholder="Type exact answer">
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
    saveProgressLocally(); // 🚨 Save Progress
    renderQuestion();
};

window.saveNumerical = (val) => {
    const qId = testData.questions[currentQIdx].id;
    if(val === "") {
        delete userAnswers[qId];
    } else {
        userAnswers[qId] = { answer: [parseFloat(val)], status: 'visited' };
    }
    saveProgressLocally(); // 🚨 Save Progress
};

window.saveAndNext = () => {
    const qId = testData.questions[currentQIdx].id;
    if (userAnswers[qId] && userAnswers[qId].answer.length > 0) {
        userAnswers[qId].status = 'answered';
    } else if (!userAnswers[qId]) {
        userAnswers[qId] = { answer: [], status: 'visited' };
    }
    navigateQ(1);
};

window.markForReview = () => {
    const qId = testData.questions[currentQIdx].id;
    if (!userAnswers[qId]) userAnswers[qId] = { answer: [], status: 'review' };
    else userAnswers[qId].status = 'review';
    navigateQ(1);
};

window.clearResponse = () => {
    const qId = testData.questions[currentQIdx].id;
    delete userAnswers[qId];
    saveProgressLocally(); // 🚨 Save Progress
    renderQuestion();
};

window.navigateQ = (step) => {
    const newIdx = currentQIdx + step;
    if (newIdx >= 0 && newIdx < testData.questions.length) {
        currentQIdx = newIdx;
        saveProgressLocally(); // 🚨 Save Progress
        renderQuestion();
    }
};

window.jumpToQ = (idx) => {
    currentQIdx = idx;
    saveProgressLocally(); // 🚨 Save Progress
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
    if (confirm("Are you sure you want to final submit the assessment? You cannot modify your answers later.")) {
        autoSubmit();
    }
};

async function autoSubmit() {
    if(isSubmitting) return;
    isSubmitting = true;
    clearInterval(timerInterval);
    
    document.body.innerHTML = `
        <div style="height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #f8fafc;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 3rem; color: #1d4ed8; margin-bottom: 20px;"></i>
            <h2 style="color: #0f172a; font-weight: 700;">Evaluating & Securing Responses...</h2>
        </div>
    `;

    const result = calculateScore();
    const cleanAccuracy = parseFloat(result.accuracy); 
    const safeUserAnswers = JSON.parse(JSON.stringify(userAnswers)); 

    try {
        const resultRef = doc(db, "users", currentUserId, "exam_results", testData.docId);
        await setDoc(resultRef, {
            testTitle: testData.title,
            score: result.totalScore,
            maxMarks: testData.maxMarks,
            accuracy: cleanAccuracy,
            timeSpent: (testData.duration * 60) - timeRemaining,
            sectionWise: result.sectionWise,
            submittedAt: serverTimestamp(),
            userAnswers: safeUserAnswers 
        });
        
        sessionStorage.setItem('submitted_' + testData.docId, 'true'); 
        
        // 🚨 CLEANUP: Submit hone ke baad saved progress ko delete kar do
        localStorage.removeItem('vp_exam_progress_' + testData.docId);
        
        showSuccessScreen(`Score Captured: ${result.totalScore} / ${testData.maxMarks}`);
        
    } catch (err) { 
        console.error("Submission Error:", err); 
        document.body.innerHTML = `
            <div style="text-align:center; padding: 50px;">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 3rem; margin-bottom:15px;"></i>
                <h3 style="color: #0f172a; margin-bottom: 10px;">Network Error</h3>
                <p>Failed to submit assessment. Do not close this tab. Please check your internet connection.</p>
                <button onclick="location.reload()" style="margin-top:20px; padding: 10px 20px; background: #1d4ed8; color: white; border: none; border-radius: 4px; font-weight: 600; cursor:pointer;">Retry Submission</button>
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
                <p style="color: #475569; font-size: 0.9rem; margin-bottom: 25px; line-height: 1.6;">${msg}<br>Your responses have been securely recorded. You may now close this tab and return to the main dashboard.</p>
                <button onclick="window.close()" style="width: 100%; padding: 12px; background: #0f172a; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 1rem; cursor: pointer; transition: 0.2s;">Close Tab</button>
            </div>
        </div>
    `;
}

function calculateScore() {
    let totalScore = 0;
    let correctCount = 0;
    let sectionWise = {};

    testData.questions.forEach(q => {
        if (!sectionWise[q.section]) sectionWise[q.section] = { score: 0, correct: 0, wrong: 0 };
        
        const userAns = userAnswers[q.id]?.answer || [];
        const correctAns = q.correctAnswers || [];
        
        if (userAns.length === 0) return; 

        const plusM = q.marks?.correct || 4;
        const minusM = q.marks?.incorrect || 1;

        const isCorrect = JSON.stringify(userAns.sort()) === JSON.stringify(correctAns.sort());
        
        if (isCorrect) {
            totalScore += plusM;
            correctCount++;
            sectionWise[q.section].score += plusM;
            sectionWise[q.section].correct++;
        } else {
            totalScore -= minusM;
            sectionWise[q.section].score -= minusM;
            sectionWise[q.section].wrong++;
        }
    });

    const attempted = Object.keys(userAnswers).filter(k => userAnswers[k].answer.length > 0).length;
    return {
        totalScore,
        accuracy: attempted > 0 ? ((correctCount / attempted) * 100).toFixed(2) : 0,
        sectionWise
    };
}
