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

// 🚨 BROWSER WARNING: Prevent accidental tab close
window.addEventListener('beforeunload', function (e) {
    if (!isSubmitting) {
        e.preventDefault();
        e.returnValue = 'Are you sure you want to leave? Your exam progress will be lost.';
    }
});

// 1. SECURE INITIALIZATION
onAuthStateChanged(auth, async (user) => {
    if (!user) { alert("Authentication failed. Please log in again."); window.close(); return; }
    currentUserId = user.uid; 

    if(!testId || !batchId) { alert("Invalid Assessment Session."); window.close(); return; }

    // Check if already submitted in this session
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

function initializePortal() {
    document.getElementById('exam-title').innerText = testData.title;
    timeRemaining = testData.duration * 60;
    
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
        
        // Naye sleek timer me update karega
        document.getElementById('timer-val').innerText = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        // Laal background hatne ki wajah se, last 5 mins me sirf text color RED hoga
        if(timeRemaining < 300) {
            document.getElementById('timer-val').style.color = '#ef4444';
        }
    }, 1000); // 🚨 YE WALE BRACKETS MISSING THE!
}

window.renderQuestion = () => {
    const q = testData.questions[currentQIdx];
    if(!q) return;

    document.getElementById('q-meta').innerText = `Question ${currentQIdx + 1} of ${testData.questions.length}`;
    
    const pM = q.marks?.correct || 4;
    const nM = q.marks?.incorrect || 1;
    document.getElementById('q-marks').innerText = `[Marks: +${pM}, -${nM}]`;
    
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
    renderQuestion();
};

window.saveNumerical = (val) => {
    const qId = testData.questions[currentQIdx].id;
    if(val === "") {
        delete userAnswers[qId];
    } else {
        userAnswers[qId] = { answer: [parseFloat(val)], status: 'visited' };
    }
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
    renderQuestion();
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

// 🚨 3. FINAL SUBMISSION ENGINE
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
    
    // UI Change to Submitting State
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
        
        // Lock this test for this session
        sessionStorage.setItem('submitted_' + testData.docId, 'true'); 
        
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
    
