// admin/js/quiz-engine.js
import { db } from '../../js/firebase-init.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let questionCounter = 0;

// 🧠 THE GOD MEMORY: Stores last selected state
let lastUsed = {
    section: "Physics",
    type: "single",
    plus: 4,
    minus: 1
};

window.openQuizPanel = () => {
    const batchId = document.getElementById('master-batch-select').value;
    if(!batchId) return window.showMsg("Validation Error: Please select a Target Batch first.");
    
    document.getElementById('quiz-panel').style.display = 'block';
    document.getElementById('q-list-items').innerHTML = '';
    questionCounter = 0;
    
    // Reset Memory for new test
    lastUsed = { section: "Physics", type: "single", plus: 4, minus: 1 };
    
    addNewQuestionField(); // Auto-add first question
    updateQCount();
};

window.closeQuizPanel = () => {
    document.getElementById('quiz-panel').style.display = 'none';
    document.getElementById('quiz-config-form').reset();
};

window.addNewQuestionField = () => {
    questionCounter++;

    // Generating self-contained question block using "lastUsed" memory
    const qHtml = `
        <div class="premium-card q-block" id="q-block-${questionCounter}" style="margin-bottom: 20px; border: 1px solid #e2e8f0; position: relative; padding: 1.5rem;">
            <div style="position: absolute; top: -10px; left: -10px; background: var(--primary); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: 800; font-size: 0.85rem; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">Q${questionCounter}</div>
            
            <button type="button" onclick="removeQuestion('q-block-${questionCounter}')" style="position: absolute; top: 15px; right: 15px; border: none; background: #fee2e2; color: #ef4444; width:30px; height:30px; border-radius:8px; cursor: pointer;"><i class="fas fa-trash"></i></button>

            <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap: wrap; padding-right: 40px; align-items: center;">
                <select class="input-control q-section" onchange="saveLastUsed(this); updateQCount();" style="width:auto; padding:6px 12px; font-size:0.85rem; font-weight:700;">
                    <option value="Physics" ${lastUsed.section==='Physics'?'selected':''}>Physics</option>
                    <option value="Chemistry" ${lastUsed.section==='Chemistry'?'selected':''}>Chemistry</option>
                    <option value="Mathematics" ${lastUsed.section==='Mathematics'?'selected':''}>Mathematics</option>
                    <option value="Biology" ${lastUsed.section==='Biology'?'selected':''}>Biology</option>
                    <option value="Aptitude" ${lastUsed.section==='Aptitude'?'selected':''}>Aptitude</option>
                </select>

                <select class="input-control q-type" onchange="saveLastUsed(this); renderAnswerArea('${questionCounter}');" style="width:auto; padding:6px 12px; font-size:0.85rem; font-weight:700;">
                    <option value="single" ${lastUsed.type==='single'?'selected':''}>Single Choice MCQ</option>
                    <option value="multiple" ${lastUsed.type==='multiple'?'selected':''}>Multi Correct</option>
                    <option value="numerical" ${lastUsed.type==='numerical'?'selected':''}>Numerical</option>
                </select>

                <div style="display: flex; align-items: center; gap: 5px; background: #f1f5f9; padding: 4px; border-radius: 8px;">
                    <span style="font-size:0.75rem; font-weight:800; margin-left:5px; color:#10b981;">+</span>
                    <input type="number" class="input-control q-plus" value="${lastUsed.plus}" onchange="saveLastUsed(this)" style="width:50px; padding:4px; font-size:0.8rem; text-align:center; border:none; background:transparent;">
                    <span style="font-size:0.75rem; font-weight:800; color:#ef4444;">-</span>
                    <input type="number" class="input-control q-minus" value="${lastUsed.minus}" onchange="saveLastUsed(this)" style="width:50px; padding:4px; font-size:0.8rem; text-align:center; border:none; background:transparent;">
                </div>
            </div>

            <textarea class="input-control q-text" rows="2" required placeholder="Type the question statement here..."></textarea>

            <div id="q-dynamic-area-${questionCounter}">
                </div>
        </div>
    `;
    
    document.getElementById('q-list-items').insertAdjacentHTML('beforeend', qHtml);
    renderAnswerArea(questionCounter); // Render specific UI
    updateQCount();
};

window.saveLastUsed = (el) => {
    const block = el.closest('.q-block');
    lastUsed.section = block.querySelector('.q-section').value;
    lastUsed.type = block.querySelector('.q-type').value;
    lastUsed.plus = block.querySelector('.q-plus').value;
    lastUsed.minus = block.querySelector('.q-minus').value;
};

window.renderAnswerArea = (qId) => {
    const block = document.getElementById(`q-block-${qId}`);
    if(!block) return;
    const qType = block.querySelector('.q-type').value;
    const dynamicArea = document.getElementById(`q-dynamic-area-${qId}`);

    let html = '';
    if (qType === 'single') {
        html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                <input type="text" class="input-control q-opt" placeholder="Option A" required>
                <input type="text" class="input-control q-opt" placeholder="Option B" required>
                <input type="text" class="input-control q-opt" placeholder="Option C" required>
                <input type="text" class="input-control q-opt" placeholder="Option D" required>
            </div>
            <div style="margin-top: 15px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                <label style="font-size:0.8rem; font-weight:700; color:var(--text); display:block; margin-bottom:5px;">Correct Answer</label>
                <select class="input-control q-ans" required>
                    <option value="0">Option A</option>
                    <option value="1">Option B</option>
                    <option value="2">Option C</option>
                    <option value="3">Option D</option>
                </select>
            </div>`;
    } else if (qType === 'multiple') {
        html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                <input type="text" class="input-control q-opt" placeholder="Option A" required>
                <input type="text" class="input-control q-opt" placeholder="Option B" required>
                <input type="text" class="input-control q-opt" placeholder="Option C" required>
                <input type="text" class="input-control q-opt" placeholder="Option D" required>
            </div>
            <div style="margin-top: 15px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                <label style="font-size:0.8rem; font-weight:700; color:var(--text); display:block; margin-bottom:5px;">Correct Answers (Select Multiple)</label>
                <div style="display:flex; gap:15px; margin-top:5px;" class="q-ans-multi">
                    <label style="font-weight:600;"><input type="checkbox" value="0"> Opt A</label>
                    <label style="font-weight:600;"><input type="checkbox" value="1"> Opt B</label>
                    <label style="font-weight:600;"><input type="checkbox" value="2"> Opt C</label>
                    <label style="font-weight:600;"><input type="checkbox" value="3"> Opt D</label>
                </div>
            </div>`;
    } else if (qType === 'numerical') {
        html = `
            <div style="color:var(--text-light); font-size:0.8rem; margin-top:10px;"><i class="fas fa-info-circle"></i> No options needed for numerical questions.</div>
            <div style="margin-top: 15px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                <label style="font-size:0.8rem; font-weight:700; color:var(--text); display:block; margin-bottom:5px;">Exact Numerical Answer</label>
                <input type="number" step="any" class="input-control q-ans-num" placeholder="e.g. 4.5 or -10" required>
            </div>`;
    }
    dynamicArea.innerHTML = html;
};

window.removeQuestion = (id) => {
    document.getElementById(id).remove();
    updateQCount();
};

// 📊 SMART LIVE COUNTER
window.updateQCount = () => {
    const blocks = document.querySelectorAll('.q-block');
    const subjectCounts = {};
    let total = 0;

    blocks.forEach(block => {
        const sec = block.querySelector('.q-section').value;
        subjectCounts[sec] = (subjectCounts[sec] || 0) + 1;
        total++;
    });

    let breakdown = [];
    for (const [sub, count] of Object.entries(subjectCounts)) {
        breakdown.push(`${sub}: ${count}`);
    }

    const countStr = breakdown.length > 0 ? `Total: ${total} &nbsp;|&nbsp; ${breakdown.join(' &bull; ')}` : "Total: 0";
    document.getElementById('q-count-display').innerHTML = countStr;
};

// 🚀 DATABASE COMPILER
document.getElementById('quiz-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const batchId = document.getElementById('master-batch-select').value;
    if(!batchId) return window.showMsg("Please select a batch first.");

    const qBlocks = document.querySelectorAll('.q-block');
    if(qBlocks.length === 0) return window.showMsg("Test cannot be empty. Add at least 1 question.");

    const submitBtn = document.getElementById('btn-save-quiz');
    submitBtn.innerText = "Compiling Database...";
    submitBtn.disabled = true;

    const compiledQuestions = Array.from(qBlocks).map((block, index) => {
        const qType = block.querySelector('.q-type').value;
        const qData = {
            id: `q${index + 1}`,
            section: block.querySelector('.q-section').value,
            type: qType,
            marks: {
                correct: parseFloat(block.querySelector('.q-plus').value),
                incorrect: parseFloat(block.querySelector('.q-minus').value)
            },
            questionText: block.querySelector('.q-text').value,
            options: [],
            correctAnswers: []
        };

        if (qType === 'single') {
            const opts = block.querySelectorAll('.q-opt');
            opts.forEach(opt => qData.options.push(opt.value));
            qData.correctAnswers.push(parseInt(block.querySelector('.q-ans').value));
        } 
        else if (qType === 'multiple') {
            const opts = block.querySelectorAll('.q-opt');
            opts.forEach(opt => qData.options.push(opt.value));
            const checks = block.querySelectorAll('.q-ans-multi input:checked');
            checks.forEach(chk => qData.correctAnswers.push(parseInt(chk.value)));
        } 
        else if (qType === 'numerical') {
            qData.correctAnswers.push(parseFloat(block.querySelector('.q-ans-num').value));
        }

        return qData;
    });

    const quizPayload = {
        type: "quiz",
        targetLayer: "quiz_engine",
        title: document.getElementById('q-title').value,
        duration: parseInt(document.getElementById('q-duration').value),
        subject: document.getElementById('q-subject').value,
        totalQuestions: compiledQuestions.length,
        maxMarks: compiledQuestions.reduce((sum, q) => sum + q.marks.correct, 0),
        questions: compiledQuestions,
        status: "Active",
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "batches", batchId, "materials"), quizPayload);
        window.showMsg("Master Test Published Successfully! 🎉");
        window.closeQuizPanel();
    } catch (err) {
        window.showMsg("Failed to upload test.");
        console.error(err);
    } finally {
        submitBtn.innerText = "Publish Master Test 🚀";
        submitBtn.disabled = false;
    }
});
