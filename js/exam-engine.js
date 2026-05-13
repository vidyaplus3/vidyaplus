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

// 🚨 1. BACK BUTTON TRAP (Anti-Exit)
window.history.pushState(null, null, window.location.href);
window.onpopstate = function () {
    window.history.pushState(null, null, window.location.href);
    if(confirm("⚠️ Warning! Pressing back will auto-submit your test. Do you want to submit?")) {
        autoSubmit();
    }
};

// 2. INITIALIZE
onAuthStateChanged(auth, async (user) => {
    if (!user) { alert("Auth Error! Please login again."); window.location.href = 'login.html'; return; }
    
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('testId');
    const batchId = urlParams.get('batchId');

    if(!testId || !batchId) { alert("Invalid Session!"); window.location.href = 'index.html#tests'; return; }

    try {
        const testSnap = await getDoc(doc(db, "batches", batchId, "materials", testId));
        if (testSnap.exists()) {
            testData = testSnap.data();
            testData.docId = testSnap.id;
            
            // Failsafe
            if(!testData.questions || testData.questions.length === 0) {
                alert("Error: This test has no questions."); window.location.href = 'index.html#tests'; return;
            }

            document.getElementById('loader').style.display = 'none'; // Hide loader
            initializeTestUI();
        } else {
            alert("Test not found in database."); window.location.href = 'index.html#tests';
        }
    } catch (err) { 
        console.error(err); 
        alert("Failed to load test. Please check internet connection."); 
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

// 3. UI TOGGLES (Mobile)
window.togglePalette = () => {
    const drawer = document.getElementById('palette-drawer');
    const overlay = document.getElementById('palette-overlay');
    drawer.classList.toggle('open');
    overlay.classList.toggle('open');
};

// 4. TIMER
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
        document.getElementById('exam-timer').innerHTML = `<i class="fas fa-clock"></i> ${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

// 5. RENDERING QUESTION
window.renderQuestion = () => {
    const q = testData.questions[currentQIdx];
    if(!q) return;

    document.getElementById('q-meta').innerText = `Q. ${currentQIdx + 1}`;
    
    const pM = q.marks?.correct || 4;
    const nM = q.marks?.incorrect || 1;
    document.getElementById('q-marks-display').innerText = `+${pM} / -${nM}`;
    
    document.getElementById('q-text').innerText = q.questionText || "Question text missing";
    
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
                    ${isSelected ? '<i class="fas fa-check-circle" style="color:var(--primary); font-size:1.2rem;"></i>' : ''}
                </div>`;
        });
    } else if (q.type === 'numerical') {
        optContainer.innerHTML = `
            <div style="padding: 10px 0;">
                <input type="number" step="any" class="num-input" id="num-ans" 
                       value="${saved.answer[0] !== undefined ? saved.answer[0] : ''}" 
                       oninput="saveNumerical(this.value)" placeholder="Type exact answer here">
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

// 6. NAVIGATION
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
        
        // Auto-switch section
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
    if(window.innerWidth < 900) togglePalette(); // Close drawer on mobile
};

// 7. PALETTE & TABS
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

// 8. FINAL SUBMISSION ENGINE
window.confirmSubmit = () => {
    if(isSubmitting) return;
    if (confirm("Are you sure you want to final submit the test? You cannot undo this.")) {
        autoSubmit();
    }
};

async function autoSubmit() {
    if(isSubmitting) return;
    isSubmitting = true;
    clearInterval(timerInterval);
    
    document.getElementById('loader').style.display = 'flex';
    document.getElementById('loader').innerHTML = `<div class="spinner"></div><h3 style="color: var(--navy); font-weight: 800;">Evaluating Answers...</h3>`;

    const userId = auth.currentUser.uid;
    const result = calculateScore();
    
    try {
        const resultRef = doc(db, "users", userId, "exam_results", testData.docId);
        await setDoc(resultRef, {
            testTitle: testData.title,
            score: result.totalScore,
            maxMarks: testData.maxMarks,
            accuracy: result.accuracy,
            timeSpent: (testData.duration * 60) - timeRemaining,
            sectionWise: result.sectionWise,
            submittedAt: serverTimestamp(),
            userAnswers: userAnswers 
        });
        
        alert(`Test Submitted Successfully!\nYour Score: ${result.totalScore} / ${testData.maxMarks}`);
        window.onpopstate = null; // Trap hatado
        window.location.href = 'index.html#tests'; // Dashboard ke tests section pe jao
    } catch (err) { 
        console.error("Submission DB Error:", err); 
        alert("Network Error: Could not submit test."); 
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
