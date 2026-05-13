// js/exam-engine.js
import { db, auth } from './firebase-init.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// STATE MANAGEMENT
let testData = null;
let currentQIdx = 0;
let userAnswers = {}; // { qId: { answer: [], status: 'answered'/'review' } }
let timeRemaining = 0;
let timerInterval = null;
let sections = [];
let currentSection = "";

// 1. INITIALIZE EXAM
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    
    // URL madhun testId ani batchId ghet aahe
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('testId');
    const batchId = urlParams.get('batchId');

    if(!testId || !batchId) { alert("Invalid Test Session!"); window.location.href = 'dashboard.html'; return; }

    try {
        const testSnap = await getDoc(doc(db, "batches", batchId, "materials", testId));
        if (testSnap.exists()) {
            testData = testSnap.data();
            testData.docId = testSnap.id;
            initializeTestUI();
        }
    } catch (err) { console.error(err); alert("Failed to load test data."); }
});

function initializeTestUI() {
    document.getElementById('exam-title').innerText = testData.title;
    timeRemaining = testData.duration * 60;
    
    // Identify Sections
    sections = [...new Set(testData.questions.map(q => q.section))];
    currentSection = sections[0];
    
    renderSectionTabs();
    startTimer();
    renderQuestion();
    renderPalette();
    
    // SECURITY: Tab switch detection
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) alert("WARNING: Tab switching is strictly prohibited during the exam!");
    });
}

// 2. TIMER LOGIC
function startTimer() {
    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            autoSubmit();
            return;
        }
        timeRemaining--;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const hrs = Math.floor(timeRemaining / 3600);
    const mins = Math.floor((timeRemaining % 3600) / 60);
    const secs = timeRemaining % 60;
    document.getElementById('exam-timer').innerText = 
        `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 3. RENDER QUESTION
window.renderQuestion = () => {
    const q = testData.questions[currentQIdx];
    document.getElementById('q-meta').innerText = `${q.section} | Question ${currentQIdx + 1}`;
    document.getElementById('q-text').innerText = q.questionText;
    
    const optContainer = document.getElementById('q-options');
    optContainer.innerHTML = '';
    
    const saved = userAnswers[q.id] || { answer: [] };

    if (q.type === 'single' || q.type === 'multiple') {
        q.options.forEach((opt, idx) => {
            const isSelected = saved.answer.includes(idx);
            optContainer.innerHTML += `
                <div class="option-card ${isSelected ? 'selected' : ''}" onclick="selectOption(${idx}, '${q.type}')">
                    <div class="opt-id">${String.fromCharCode(65 + idx)}</div>
                    <div>${opt}</div>
                </div>`;
        });
    } else if (q.type === 'numerical') {
        optContainer.innerHTML = `
            <div style="padding: 20px 0;">
                <input type="number" step="any" class="num-input" id="num-ans" 
                       value="${saved.answer[0] || ''}" onchange="saveNumerical(this.value)" placeholder="Type Answer">
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
    userAnswers[qId] = { answer: [parseFloat(val)], status: 'visited' };
};

// 4. NAVIGATION & PALETTE
window.saveAndNext = () => {
    const qId = testData.questions[currentQIdx].id;
    if (userAnswers[qId] && userAnswers[qId].answer.length > 0) {
        userAnswers[qId].status = 'answered';
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
}

window.switchSection = (secName) => {
    currentSection = secName;
    const firstQOfSec = testData.questions.findIndex(q => q.section === secName);
    currentQIdx = firstQOfSec;
    renderSectionTabs();
    renderQuestion();
};

// 5. SUBMISSION & SCORING (The God Memory)
window.confirmSubmit = () => {
    if (confirm("Are you sure you want to submit the test?")) autoSubmit();
};

async function autoSubmit() {
    clearInterval(timerInterval);
    const userId = auth.currentUser.uid;
    const result = calculateScore();
    
    try {
        // Saving to Users -> Results (God Memory)
        const resultRef = doc(db, "users", userId, "exam_results", testData.docId);
        await setDoc(resultRef, {
            testTitle: testData.title,
            score: result.totalScore,
            maxMarks: testData.maxMarks,
            accuracy: result.accuracy,
            timeSpent: (testData.duration * 60) - timeRemaining,
            sectionWise: result.sectionWise,
            submittedAt: serverTimestamp(),
            userAnswers: userAnswers // For detailed review
        });
        
        alert(`Test Submitted! Score: ${result.totalScore} / ${testData.maxMarks}`);
        window.location.href = 'dashboard.html';
    } catch (err) { console.error(err); alert("Submission failed. Error logged."); }
}

function calculateScore() {
    let totalScore = 0;
    let correctCount = 0;
    let sectionWise = {};

    testData.questions.forEach(q => {
        if (!sectionWise[q.section]) sectionWise[q.section] = { score: 0, correct: 0, wrong: 0 };
        
        const userAns = userAnswers[q.id]?.answer || [];
        const correctAns = q.correctAnswers;
        
        if (userAns.length === 0) return; // Unattempted

        const isCorrect = JSON.stringify(userAns.sort()) === JSON.stringify(correctAns.sort());
        
        if (isCorrect) {
            totalScore += q.marks.correct;
            correctCount++;
            sectionWise[q.section].score += q.marks.correct;
            sectionWise[q.section].correct++;
        } else {
            totalScore -= q.marks.incorrect;
            sectionWise[q.section].score -= q.marks.incorrect;
            sectionWise[q.section].wrong++;
        }
    });

    const attempted = Object.keys(userAnswers).length;
    return {
        totalScore,
        accuracy: attempted > 0 ? (correctCount / attempted) * 100 : 0,
        sectionWise
    };
}

