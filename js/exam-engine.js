// js/exam-engine.js
import { db, auth } from './firebase-init.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let testData = null;
let currentQIdx = 0;
let userAnswers = {}; 
let timeRemaining = 0;
let timerInterval = null;
let sections = [];
let currentSection = "";
let isSubmitting = false;
let currentUserId = null; // 🚨 NAYA: Global user ID taaki submit ke waqt null na ho

// 1. BACK BUTTON TRAP
window.history.pushState(null, null, window.location.href);
window.onpopstate = function () {
    window.history.pushState(null, null, window.location.href);
    if(confirm("⚠️ Pressing back will submit your test! Do you want to submit?")) {
        autoSubmit();
    }
};

// 2. INITIALIZE
onAuthStateChanged(auth, async (user) => {
    if (!user) { alert("Auth Error! Login again."); window.location.href = 'index.html'; return; }
    currentUserId = user.uid; // Store UID securely
    
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('testId');
    const batchId = urlParams.get('batchId');

    if(!testId || !batchId) { alert("Invalid Session!"); window.location.href = 'index.html#tests'; return; }

    try {
        const testSnap = await getDoc(doc(db, "batches", batchId, "materials", testId));
        if (testSnap.exists()) {
            testData = testSnap.data();
            testData.docId = testSnap.id;
            
            if(!testData.questions || testData.questions.length === 0) {
                alert("This test has no questions."); window.location.href = 'index.html#tests'; return;
            }

            document.getElementById('loader').style.display = 'none';
            initializeTestUI();
        } else {
            alert("Test not found in database."); window.location.href = 'index.html#tests';
        }
    } catch (err) { 
        alert("Failed to load test. Check network."); 
        window.location.href = 'index.html#tests'; 
    }
});

function initializeTestUI() {
    document.getElementById('exam-title').innerText = testData.title;
    timeRemaining = testData.duration * 60;
    
    sections = [...new Set(testData.questions.map(q => q.section))];
    currentSection = sections[0] || "General";
    
    renderSectionTabs();
    startTimer();
    renderQuestion();
    renderPalette();
}

window.togglePalette = () => {
    document.getElementById('palette-drawer').classList.toggle('open');
    document.getElementById('palette-overlay').classList.toggle('open');
};

function startTimer() {
    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            autoSubmit(); // Auto Submit if time ends
            return;
        }
        timeRemaining--;
        const hrs = Math.floor(timeRemaining / 3600);
        const mins = Math.floor((timeRemaining % 3600) / 60);
        const secs = timeRemaining % 60;
        document.getElementById('exam-timer').innerText = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

window.renderQuestion = () => {
    const q = testData.questions[currentQIdx];
    if(!q) return;

    document.getElementById('q-meta').innerText = `Question ${currentQIdx + 1}`;
    
    const pM = q.marks?.correct || 4;
    const nM = q.marks?.incorrect || 1;
    document.getElementById('q-marks-display').innerText = `Marks: +${pM}, -${nM}`;
    
    document.getElementById('q-text').innerText = q.questionText || "Missing question";
    
    const optContainer = document.getElementById('q-options');
    optContainer.innerHTML = '';
    
    const saved = userAnswers[q.id] || { answer: [] };

    if (q.type === 'single' || q.type === 'multiple') {
        const options = q.options || [];
        options.forEach((opt, idx) => {
            const isSelected = saved.answer.includes(idx);
            optContainer.innerHTML += `
                <div class="option-card ${isSelected ? 'selected' : ''}" onclick="selectOption(${idx}, '${q.type}')">
                    <div class="opt-id">${String.fromCharCode(65 + idx)}</div>
                    <div style="flex: 1;">${opt}</div>
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
        const newSec = testData.questions[currentQIdx].section;
        if(newSec !== currentSection) {
            currentSection = newSec;
            renderSectionTabs();
        }
        renderQuestion();
    }
};

window.jumpToQ = (idx) => {
    currentQIdx = idx;
    const newSec = testData.questions[currentQIdx].section;
    if(newSec !== currentSection) {
        currentSection = newSec;
        renderSectionTabs();
    }
    renderQuestion();
    if(window.innerWidth < 900) {
        document.getElementById('palette-drawer').classList.remove('open');
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

function renderSectionTabs() {
    const container = document.getElementById('section-tabs-container');
    container.innerHTML = '';
    sections.forEach(sec => {
        container.innerHTML += `<button class="sec-tab ${sec === currentSection ? 'active' : ''}" onclick="switchSection('${sec}')">${sec}</button>`;
    });
    const activeTab = container.querySelector('.active');
    if(activeTab) activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

window.switchSection = (secName) => {
    currentSection = secName;
    const firstQOfSec = testData.questions.findIndex(q => q.section === secName);
    if(firstQOfSec !== -1) {
        currentQIdx = firstQOfSec;
        renderSectionTabs();
        renderQuestion();
    }
};

// 🚨 8. FAIL-SAFE SUBMISSION ENGINE
window.confirmSubmit = () => {
    if(isSubmitting) return;
    if (confirm("Are you sure you want to submit the test? You cannot change your answers later.")) {
        autoSubmit();
    }
};

async function autoSubmit() {
    if(isSubmitting) return;
    isSubmitting = true;
    clearInterval(timerInterval);
    
    document.getElementById('loader').style.display = 'flex';
    document.getElementById('loader').innerHTML = `<div class="spinner"></div><h3 style="color: var(--navy); font-weight: 600;">Evaluating Answers...</h3>`;

    const result = calculateScore();
    
    // 🚨 FIREBASE CRASH FIX: Parse data properly so Firebase doesn't reject it
    const cleanAccuracy = parseFloat(result.accuracy); // String se Number me change
    const safeUserAnswers = JSON.parse(JSON.stringify(userAnswers)); // Remove undefined values

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
        
        alert(`Test Submitted Successfully!\nYour Score: ${result.totalScore} / ${testData.maxMarks}`);
        window.onpopstate = null; 
        window.location.href = 'index.html#tests'; 
    } catch (err) { 
        console.error("Submission DB Error:", err); 
        // 🚨 NAYA: Exact error message dikhayega taaki hume reason pata chale
        alert("Database Error: " + err.message + "\n\n(Check Firebase Firestore Rules if it says 'Missing Permissions')"); 
        isSubmitting = false;
        document.getElementById('loader').style.display = 'none';
    }
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
