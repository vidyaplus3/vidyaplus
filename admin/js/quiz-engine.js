// admin/js/quiz-engine.js
import { db } from '../../js/firebase-init.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let questionCounter = 0;

window.openQuizPanel = () => {
    const batchId = document.getElementById('master-batch-select').value;
    if(!batchId) return window.showMsg("Validation Error: Please select a Target Batch first.");
    
    document.getElementById('quiz-panel').style.display = 'block';
    document.getElementById('q-list-items').innerHTML = '';
    document.getElementById('q-count').innerText = "0";
    questionCounter = 0;
};

window.closeQuizPanel = () => {
    document.getElementById('quiz-panel').style.display = 'none';
    document.getElementById('quiz-config-form').reset();
};

window.addNewQuestionField = () => {
    questionCounter++;
    const section = document.getElementById('q-curr-section').value;
    const qType = document.getElementById('q-curr-type').value;
    const plusMarks = document.getElementById('q-mark-plus').value;
    const minusMarks = document.getElementById('q-mark-minus').value;

    let optionsHtml = '';
    let answerHtml = '';

    // SMART UI: Based on Question Type
    if (qType === 'single') {
        optionsHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                <input type="text" class="input-control q-opt" placeholder="Option A" required>
                <input type="text" class="input-control q-opt" placeholder="Option B" required>
                <input type="text" class="input-control q-opt" placeholder="Option C" required>
                <input type="text" class="input-control q-opt" placeholder="Option D" required>
            </div>`;
        answerHtml = `
            <select class="input-control q-ans" required>
                <option value="0">Correct: Option A</option>
                <option value="1">Correct: Option B</option>
                <option value="2">Correct: Option C</option>
                <option value="3">Correct: Option D</option>
            </select>`;
    } else if (qType === 'multiple') {
        optionsHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                <input type="text" class="input-control q-opt" placeholder="Option A" required>
                <input type="text" class="input-control q-opt" placeholder="Option B" required>
                <input type="text" class="input-control q-opt" placeholder="Option C" required>
                <input type="text" class="input-control q-opt" placeholder="Option D" required>
            </div>`;
        answerHtml = `
            <div style="display:flex; gap:15px; margin-top:5px;" class="q-ans-multi">
                <label><input type="checkbox" value="0"> Opt A</label>
                <label><input type="checkbox" value="1"> Opt B</label>
                <label><input type="checkbox" value="2"> Opt C</label>
                <label><input type="checkbox" value="3"> Opt D</label>
            </div>`;
    } else if (qType === 'numerical') {
        optionsHtml = `<div style="color:var(--text-light); font-size:0.8rem; margin-top:10px;">* No options needed for numerical questions.</div>`;
        answerHtml = `<input type="number" step="any" class="input-control q-ans-num" placeholder="Enter Exact Numerical Answer" required>`;
    }

    const qHtml = `
        <div class="premium-card q-block" id="q-block-${questionCounter}" style="margin-bottom: 15px; border: 1px solid #e2e8f0; position: relative; padding: 1.2rem;">
            <button type="button" onclick="removeQuestion('q-block-${questionCounter}')" style="position: absolute; top: 15px; right: 15px; border: none; background: #fee2e2; color: #ef4444; width:30px; height:30px; border-radius:8px; cursor: pointer;"><i class="fas fa-trash"></i></button>
            
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <span style="background:var(--primary); color:white; padding:3px 8px; border-radius:6px; font-size:0.7rem; font-weight:800;">${section}</span>
                <span style="background:#f1f5f9; color:var(--text-light); padding:3px 8px; border-radius:6px; font-size:0.7rem; font-weight:800; text-transform:uppercase;">${qType}</span>
                <span style="background:#ecfdf5; color:#10b981; padding:3px 8px; border-radius:6px; font-size:0.7rem; font-weight:800;">+${plusMarks} / -${minusMarks}</span>
            </div>

            <input type="hidden" class="meta-section" value="${section}">
            <input type="hidden" class="meta-type" value="${qType}">
            <input type="hidden" class="meta-plus" value="${plusMarks}">
            <input type="hidden" class="meta-minus" value="${minusMarks}">

            <textarea class="input-control q-text" rows="2" required placeholder="Type the question statement here..."></textarea>
            
            ${optionsHtml}
            
            <div style="margin-top: 15px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                <label style="font-size:0.8rem; font-weight:700; color:var(--text); display:block; margin-bottom:5px;">Correct Answer(s)</label>
                ${answerHtml}
            </div>
        </div>
    `;
    
    document.getElementById('q-list-items').insertAdjacentHTML('beforeend', qHtml);
    updateQCount();
};

window.removeQuestion = (id) => {
    document.getElementById(id).remove();
    updateQCount();
};

function updateQCount() {
    const count = document.querySelectorAll('.q-block').length;
    document.getElementById('q-count').innerText = count;
}

// THE GOD MEMORY COMPILER
document.getElementById('quiz-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const batchId = document.getElementById('master-batch-select').value;
    if(!batchId) return window.showMsg("Please select a batch first.");

    const qBlocks = document.querySelectorAll('.q-block');
    if(qBlocks.length === 0) return window.showMsg("Test cannot be empty. Add at least 1 question.");

    const submitBtn = document.getElementById('btn-save-quiz');
    submitBtn.innerText = "Compiling Database...";
    submitBtn.disabled = true;

    // Collect and format all questions
    const compiledQuestions = Array.from(qBlocks).map((block, index) => {
        const qType = block.querySelector('.meta-type').value;
        const qData = {
            id: `q${index + 1}`,
            section: block.querySelector('.meta-section').value,
            type: qType,
            marks: {
                correct: parseFloat(block.querySelector('.meta-plus').value),
                incorrect: parseFloat(block.querySelector('.meta-minus').value)
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
        targetLayer: "quiz_engine", // For smart routing in student app
        title: document.getElementById('q-title').value,
        duration: parseInt(document.getElementById('q-duration').value),
        subject: document.getElementById('q-subject').value, // 'Full Mock' or Subject specific
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
        // Option to reload list can be added here
    } catch (err) {
        window.showMsg("Failed to upload test.");
        console.error(err);
    } finally {
        submitBtn.innerText = "Publish Test to App 🚀";
        submitBtn.disabled = false;
    }
});
