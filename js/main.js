// js/main.js
import { db, auth } from './firebase-init.js'; 
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initAuth, AppState } from './auth.js'; 
import { UI } from './ui.js';
import { VideoPlayer } from './player.js';
import { PDFViewer } from './pdf.js';
import './video-tracker.js';

// ==========================================
// 1. CORE BUSINESS LOGIC (Secure Functions)
// ==========================================

async function switchBatch(batchId) {
    if (!batchId) return;

    // Step A: Local State & UI Update
    const batchNameEl = document.getElementById('current-batch-name');
    if (batchNameEl) batchNameEl.innerText = "Authenticating & Loading...";
    
    localStorage.setItem('vp_batch', batchId);
    AppState.currentBatchId = batchId;
    
    const initialScreen = window.location.hash.replace('#', '') || 'dashboard';
    window.handleScreenRender(initialScreen); 

    const skeletonHTML = `<div class="list-card" style="border:none; box-shadow:none; padding:15px 0;"><div class="skeleton" style="width:45px; height:45px; border-radius:10px; flex-shrink:0;"></div><div style="flex:1;"><div class="skeleton" style="height:16px; width:70%; margin-bottom:8px; border-radius:4px;"></div><div class="skeleton" style="height:12px; width:40%; border-radius:4px;"></div></div></div>`.repeat(5);
    
    const subList = document.getElementById('subject-list');
    const chapList = document.getElementById('chapter-list');
    const lecList = document.getElementById('lecture-list');

    if(initialScreen === 'subjects' && subList) subList.innerHTML = skeletonHTML;
    if(initialScreen === 'chapters' && chapList) chapList.innerHTML = skeletonHTML;
    if(initialScreen === 'classroom' && lecList) lecList.innerHTML = skeletonHTML;

    try {
        // Step B: Secure Data Fetching
        const batchSnap = await getDoc(doc(db, "batches", batchId));
        if (batchSnap.exists() && batchNameEl) batchNameEl.innerText = batchSnap.data().title;

        const matRef = collection(db, "batches", batchId, "materials");
        const q = query(matRef, where("status", "==", "Active"));
        const matSnap = await getDocs(q);

        if (matSnap.empty) {
            console.warn("System Notice: No materials found or access restricted.");
        }

        AppState.materialsTree = {};
        AppState.globalResources = [];
        AppState.subjectMaterials = {};
        AppState.quizzes = [];

        matSnap.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            const targetLayer = data.targetLayer || "";
            const subject = data.subject || "General";
            const chapter = data.chapter || "Uncategorized";

            if (data.type === 'quiz') {
                AppState.quizzes.push(data);
            } else if (targetLayer === 'global_resource' || subject === 'Batch Resources') {
                AppState.globalResources.push(data);
            } else if (targetLayer === 'subject_material' || chapter === 'Subject Materials') {
                if (!AppState.subjectMaterials[subject]) AppState.subjectMaterials[subject] = [];
                AppState.subjectMaterials[subject].push(data);
            } else {
                if (!AppState.materialsTree[subject]) AppState.materialsTree[subject] = {};
                if (!AppState.materialsTree[subject][chapter]) AppState.materialsTree[subject][chapter] = [];
                AppState.materialsTree[subject][chapter].push(data);
            }
        });
        
        window.handleScreenRender(initialScreen); 

    } catch (error) { 
        console.error("Batch Authorization Error:", error); 
        // 🚨 SECURITY FALLBACK: Block Unauthorized Access
        if (error.code === 'permission-denied') {
            alert("Security System: Unauthorized access detected. You are not enrolled in this batch.");
            window.location.replace("explore.html");
        }
    }
}
// ==========================================
// 2. API GATEWAY (Centralized Global Exports)
// ==========================================
window.switchBatch = switchBatch; // 🚨 FIX: Explicit global mapping done here
window.openMenu = UI.openMenu;
window.openNotif = UI.openNotif;
window.closeModals = UI.closeModals;
window.toggleDropdown = UI.toggleDropdown;
window.switchTabUI = UI.switchTabUI;

window.togglePlay = VideoPlayer.togglePlay;
window.toggleMute = VideoPlayer.toggleMute;
window.toggleFullScreen = VideoPlayer.toggleFullScreen;
window.skipVideo = VideoPlayer.skipVideo;
window.setSpeed = VideoPlayer.setSpeed;
window.closeClassroom = VideoPlayer.closeVideo;
window.openVideo = (vidUrl, title, pdfUrl) => {
    VideoPlayer.openVideo(vidUrl, title, pdfUrl); 
    window.switchClassroomTab('comments'); 
};
window.showUI = VideoPlayer.showUI;
window.handleShieldClick = VideoPlayer.handleShieldClick;
window.toggleSettings = VideoPlayer.toggleSettings;
window.startDrag = VideoPlayer.startDrag;
window.stopDrag = VideoPlayer.stopDrag;
window.doDrag = VideoPlayer.doDrag;

window.openPDF = PDFViewer.openPDF;
window.closePDF = PDFViewer.closePDF;
window.togglePDFFull = PDFViewer.togglePDFFull;


// ==========================================
// 3. ROUTING & UI RENDER ENGINE
// ==========================================
window.handleScreenRender = (screenId) => {
    UI.showScreen(screenId); 
    
    if (screenId === 'subjects') window.renderSubjects();
    if (screenId === 'chapters' && AppState.currentSubject) window.renderChapters(AppState.currentSubject);
    if (screenId === 'classroom' && AppState.currentChapter) window.filterClassroom('all');
    if (screenId === 'tests') window.renderTestsList('live'); 
};

window.addEventListener('hashchange', () => { 
    if(window.closeInstructions) window.closeInstructions();
    if(window.closeModals) window.closeModals();
    window.handleScreenRender(window.location.hash.replace('#', '') || 'dashboard'); 
});

window.addEventListener('popstate', (e) => {
    const pdfOverlay = document.getElementById('pdf-mode');
    const classOverlay = document.getElementById('classroom-mode');
    
    if (pdfOverlay && pdfOverlay.classList.contains('active')) {
        pdfOverlay.classList.remove('active');
        let iframe = document.getElementById('pdf-iframe');
        if (iframe) iframe.remove();
        if (e.state && e.state.pdfOpen) window.history.back();
    } else if (classOverlay && classOverlay.classList.contains('active')) {
        if (!e.state || !e.state.videoOpen) {
            classOverlay.classList.remove('active');
            if(VideoPlayer.progressInterval) clearInterval(VideoPlayer.progressInterval);
            if(VideoPlayer.ytPlayer && VideoPlayer.ytPlayer.pauseVideo) VideoPlayer.ytPlayer.pauseVideo();
        }
    }
});

window.navigate = (screenId, payload = {}) => {
    if (payload.subject) { AppState.currentSubject = payload.subject; localStorage.setItem('vp_subject', payload.subject); }
    if (payload.chapter) { AppState.currentChapter = payload.chapter; localStorage.setItem('vp_chapter', payload.chapter); }
    window.location.hash = screenId;
};


// ==========================================
// 4. DATA PRESENTATION LOGIC
// ==========================================
window.switchTab = (btnElement, listId) => {
    UI.switchTabUI(btnElement);
    if (listId === 'resource-list') window.renderExtraMaterials('subject-list', AppState.globalResources, "No global resources available."); 
    else if (listId === 'subject-list') window.renderSubjects(); 
    else if (listId === 'chapter-material') window.renderExtraMaterials('chapter-list', AppState.subjectMaterials[AppState.currentSubject] || [], "No extra material found."); 
    else if (listId === 'chapter-list') window.renderChapters(AppState.currentSubject); 
};

window.renderSubjects = () => {
    const container = document.getElementById('subject-list');
    if(!container) return;
    container.innerHTML = ''; 
    const coreSubjects = Object.keys(AppState.materialsTree || {});
    const extraSubjects = Object.keys(AppState.subjectMaterials || {});
    const subjects = [...new Set([...coreSubjects, ...extraSubjects])];
    if (subjects.length === 0) { container.innerHTML = `<div class="empty-box"><i class="fas fa-book"></i><h4>No subjects assigned.</h4></div>`; return; }
    subjects.forEach(subject => { container.innerHTML += `<div class="list-card" onclick="navigate('chapters', {subject: '${subject}'})"><div class="card-icon">${subject.substring(0, 2).toUpperCase()}</div><div class="card-info"><div class="card-title">${subject}</div><div class="card-sub">Access materials & lectures</div></div><i class="fas fa-chevron-right" style="color: var(--text-light);"></i></div>`; });
};

window.renderChapters = (subjectName) => {
    const container = document.getElementById('chapter-list');
    if(!container) return;
    const dynSub = document.getElementById('dyn-subject-title');
    if(dynSub) dynSub.innerText = subjectName;
    container.innerHTML = '';
    const chaptersObj = AppState.materialsTree[subjectName];
    if (!chaptersObj) { container.innerHTML = `<div class="empty-box"><i class="fas fa-layer-group"></i><h4>No chapters structured yet.</h4></div>`; return; }
    let index = 1;
    for (const [chapter, materials] of Object.entries(chaptersObj)) {
        container.innerHTML += `<div class="list-card" onclick="navigate('classroom', {chapter: '${chapter}'})"><div class="card-info"><span style="font-size:0.75rem; font-weight:800; color:var(--primary); background:#E0E7FF; padding:4px 8px; border-radius:6px;">CH-${index < 10 ? '0'+index : index}</span><div class="card-title" style="margin-top: 8px;">${chapter}</div><div class="card-sub">Lectures: ${materials.filter(m => m.videoUrl).length} • Documents: ${materials.filter(m => m.pdfUrl).length}</div></div><i class="fas fa-chevron-right" style="color: var(--text-light);"></i></div>`;
        index++;
    }
};
window.filterClassroom = (filterType, btnElement = null) => {
    const container = document.getElementById('lecture-list');
    if(!container) return;
    if(btnElement) UI.switchTabUI(btnElement);
    const dynChap = document.getElementById('dyn-chapter-title');
    if(dynChap) dynChap.innerText = AppState.currentChapter;
    container.innerHTML = '';
    const allMaterials = AppState.materialsTree[AppState.currentSubject]?.[AppState.currentChapter];
    if (!allMaterials) return;
    let items = allMaterials;
    if(filterType === 'lectures') items = allMaterials.filter(m => m.videoUrl);
    if(filterType === 'notes') items = allMaterials.filter(m => m.pdfUrl || m.attachedPdfUrl); 
    if (items.length === 0) { container.innerHTML = `<div class="empty-box"><i class="fas fa-search"></i><h4>No relevant content found.</h4></div>`; return; }
    items.forEach(mat => {
        let safeTitle = mat.title ? mat.title.replace(/['"\\]/g, "") : "Study Material";
        let actualPdfUrl = mat.pdfUrl || mat.attachedPdfUrl || ""; 
        let safePdf = actualPdfUrl.replace(/['"\\]/g, "");
        let safeVid = mat.videoUrl ? mat.videoUrl.replace(/['"\\]/g, "") : "";
        let btns = '';
        if (actualPdfUrl && (filterType === 'all' || filterType === 'notes')) { btns += `<button class="action-btn" onclick="openPDF('${safePdf}', '${safeTitle}')" style="background: transparent; color: inherit; border: 1px solid var(--border);"><i class="fas fa-file-pdf" style="color: #EF4444;"></i> Document</button>`; }
        if (mat.videoUrl && (filterType === 'all' || filterType === 'lectures')) { let attach = mat.attachedPdfUrl ? mat.attachedPdfUrl.replace(/['"\\]/g, "") : ""; btns += `<button class="action-btn play" onclick="openVideo('${safeVid}', '${safeTitle}', '${attach}')"><i class="fas fa-play"></i> Watch</button>`; }
        container.innerHTML += `<div class="lecture-card"><div class="lec-top"><div class="card-info"><div class="card-title" style="white-space: normal;">${mat.title}</div><div class="card-sub" style="margin-top: 5px;"><i class="fas fa-bookmark"></i> Academic Material</div></div></div><div class="lec-actions">${btns}</div></div>`;
    });
};

window.renderExtraMaterials = (containerId, items, emptyMsg) => {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    if(!items || items.length === 0) { container.innerHTML = `<div class="empty-box"><i class="fas fa-folder-open"></i><h4>${emptyMsg}</h4></div>`; return; }
    items.forEach(mat => {
        let safeTitle = mat.title ? mat.title.replace(/['"\\]/g, "") : "Resource"; let url = mat.pdfUrl || mat.linkUrl || mat.videoUrl || ""; let safeUrl = url.replace(/['"\\]/g, "");
        let icon = 'fa-link'; let color = '#3B82F6'; let badge = 'LINK';
        if(mat.type === 'pdf') { icon = 'fa-file-pdf'; color = '#EF4444'; badge = 'PDF'; }
        if(mat.type === 'dpp') { icon = 'fa-tasks'; color = '#F59E0B'; badge = 'DPP'; }
        let btnHtml = `<button onclick="window.open('${safeUrl}', '_blank')" style="background: ${color}; border:none; padding: 6px 15px; color:white; border-radius:8px; font-weight:600; cursor:pointer;">Open</button>`;
        if(mat.type === 'pdf' || mat.type === 'dpp' || mat.pdfUrl) { btnHtml = `<button onclick="openPDF('${safeUrl}', '${safeTitle}')" style="background: ${color}; border:none; padding: 6px 15px; color:white; border-radius:8px; font-weight:600; cursor:pointer;">View</button>`; }
        container.innerHTML += `<div class="list-card"><div class="card-icon" style="background: ${color}15; color: ${color};"><i class="fas ${icon}"></i></div><div class="card-info"><div class="card-title">${mat.title}</div><div class="card-sub" style="margin-top:4px;"><span style="font-size:0.65rem; background:${color}20; color:${color}; padding:2px 6px; border-radius:4px; font-weight:800;">${badge}</span></div></div>${btnHtml}</div>`;
    });
};

window.switchClassroomTab = (type) => {
    const content = document.getElementById('classroom-dynamic-content');
    if(!content) return;
    const tabComm = document.getElementById('tab-comments'); const tabNotes = document.getElementById('tab-notes'); const targetTab = document.getElementById('tab-' + type);
    if(tabComm) tabComm.classList.remove('active'); if(tabNotes) tabNotes.classList.remove('active'); if(targetTab) targetTab.classList.add('active');
    if (type === 'comments') {
        content.innerHTML = `<div style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem;">Academic Discussion</div><div class="comment-card"><div class="user-avatar">AS</div><div class="comment-body"><div class="comment-user">Student <span style="font-weight: 400; opacity: 0.6; font-size: 0.7rem; margin-left: 10px;">Recent</span></div><div class="comment-text">The conceptual breakdown in this lecture was highly effective.</div></div></div><div style="position: sticky; bottom: 0; background: white; padding-top: 10px;"><input type="text" placeholder="Post a query..." style="width: 100%; padding: 12px; border-radius: 25px; border: 1px solid var(--border); outline: none;"></div>`;
    } else if (type === 'notes') {
        const pdf = VideoPlayer.currentClassroomData ? (VideoPlayer.currentClassroomData.attachedPdfUrl || VideoPlayer.currentClassroomData.pdfUrl) : '';
        if (pdf && pdf !== 'undefined' && pdf !== '') {
            let safeTitle = VideoPlayer.currentClassroomData.title ? VideoPlayer.currentClassroomData.title.replace(/['"\\]/g, "") : "Study Notes"; let safePdf = pdf.replace(/['"\\]/g, "");
            content.innerHTML = `<div style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem;">Associated Documentation</div><div class="list-card" style="background: #fdf2f2; border-color: #fecaca;"><div class="card-icon" style="background: #ef4444; color: white;"><i class="fas fa-file-pdf"></i></div><div class="card-info"><div class="card-title">Class_Notes.pdf</div><div class="card-sub">Select to view</div></div><button onclick="openPDF('${safePdf}', '${safeTitle}')" style="background: #ef4444; border:none; padding: 8px 15px; color:white; border-radius:8px; font-weight:600; cursor:pointer;">Access</button></div>`;
        } else { content.innerHTML = `<div class="empty-box"><i class="fas fa-file-excel"></i><h4>No supplementary materials attached.</h4></div>`; }
    }
};

// ==========================================
// 5. TEST PORTAL ENGINE
// ==========================================
window.testsDataCache = {};
window.userAttemptedQuizzes = {}; 

window.switchTestTab = (type, btn) => {
    UI.switchTabUI(btn);
    window.renderTestsList(type);
};

window.renderTestsList = async (type = 'live') => {
    const container = document.getElementById('test-list-container');
    if(!container) return;

    container.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: #2563eb;"></i><p style="margin-top:10px; font-weight:600; color:#64748b;">Syncing Assessment Data...</p></div>';

    let allAttemptsMap = {};
    if (auth && auth.currentUser) {
        try {
            const snapshot = await getDocs(collection(db, `users/${auth.currentUser.uid}/exam_results`));
            snapshot.forEach(docSnap => {
                allAttemptsMap[docSnap.id] = docSnap.data(); 
                window.userAttemptedQuizzes[docSnap.id] = true; 
            });
        } catch (err) {
            console.error("Failed to sync attempts from DB:", err);
        }
    }

    const currentBatchQuizzes = AppState.quizzes || [];
    const currentBatchTestIds = currentBatchQuizzes.map(q => q.id);
    
    let attemptedMap = {};
    currentBatchTestIds.forEach(tId => {
        if (allAttemptsMap[tId]) attemptedMap[tId] = allAttemptsMap[tId];
    });
    container.innerHTML = '';

    if (type === 'dashboard') {
        const attemptedIds = Object.keys(attemptedMap);
        if (attemptedIds.length === 0) {
            container.innerHTML = `<div class="empty-box" style="margin-top: 50px;"><i class="fas fa-chart-line" style="opacity:0.2;"></i><h4 style="margin-top:10px; font-weight:500;">No data to analyze in this batch yet.</h4></div>`;
            return;
        }

        let totalTests = attemptedIds.length;
        let totalScore = 0; let totalMax = 0;
        let graphScores = []; let graphLabels = [];

        attemptedIds.forEach((tId, index) => {
            const d = attemptedMap[tId];
            const sc = d.latestScore || d.score || 0;
            const mx = d.maxMarks || 100;
            totalScore += sc; totalMax += mx;
            
            let percent = mx > 0 ? ((sc / mx) * 100).toFixed(1) : 0;
            graphScores.push(percent);
            graphLabels.push(`Test ${index + 1}`);
        });

        let avgPercentage = totalMax > 0 ? ((totalScore / totalMax) * 100).toFixed(1) : 0;

        container.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
                <h3 style="font-size: 1.2rem; font-weight: 800; color: #0f172a; margin-bottom: 15px;">Overall Progress</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: #eff6ff; padding: 15px; border-radius: 8px; border: 1px solid #bfdbfe; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 800; color: #1d4ed8;">${avgPercentage}%</div>
                        <div style="font-size: 0.8rem; font-weight: 600; color: #64748b;">Average Accuracy</div>
                    </div>
                    <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #bbf7d0; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 800; color: #15803d;">${totalTests}</div>
                        <div style="font-size: 0.8rem; font-weight: 600; color: #64748b;">Total Tests Attempted</div>
                    </div>
                </div>
                <h4 style="font-weight: 700; color: #334155; margin-bottom: 10px;">Growth Trajectory (%)</h4>
                <div id="overall-growth-chart" style="width: 100%; height: 250px;"></div>
            </div>
        `;

        if(window.ApexCharts) {
            new ApexCharts(document.querySelector("#overall-growth-chart"), {
                series: [{ name: 'Accuracy %', data: graphScores }],
                chart: { type: 'area', height: 250, toolbar: { show: false } },
                colors: ['#8b5cf6'],
                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.9, stops: [0, 90, 100] } },
                dataLabels: { enabled: true },
                stroke: { curve: 'smooth', width: 3 },
                xaxis: { categories: graphLabels }
            }).render();
        }
        return;
    }

    if (type === 'attempted') {
        const attemptedIds = Object.keys(attemptedMap);
        if (attemptedIds.length === 0) {
            container.innerHTML = `<div class="empty-box"><i class="fas fa-clipboard-check"></i><h4 style="margin-top:10px;">No Attempted Tests in this Batch</h4></div>`;
            return;
        }

        attemptedIds.forEach(tId => {
            const data = attemptedMap[tId];
            const title = data.testTitle || 'Secure Assessment';
            const score = data.latestScore !== undefined ? data.latestScore : (data.score || 0);
            const maxMarks = data.maxMarks || '--';
            const attempts = data.totalAttempts || 1;
            const attemptId = data.latestAttemptId || '';

            container.innerHTML += `
                <div style="background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Assessment Completed</div>
                            <h3 style="font-size: 1.05rem; color: #0f172a; font-weight: 700; margin-bottom: 12px;">${title}</h3>
                        </div>
                        <div><span style="color: #059669; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-check-circle"></i> Submitted</span></div>
                    </div>
                    <div style="display: flex; gap: 20px; font-size: 0.8rem; color: #475569; font-weight: 500; margin-bottom: 16px;">
                        <span style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;"><i class="fas fa-redo-alt" style="color: #3b82f6;"></i> Attempts: ${attempts}</span>
                        <span style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;"><i class="fas fa-star" style="color: #f59e0b;"></i> Score: ${score} / ${maxMarks}</span>
                    </div>
                    <div style="border-top: 1px solid #f1f5f9; padding-top: 12px; display: flex; justify-content: flex-end;">
                        <button onclick="window.location.href='analytics.html?testId=${tId}&attemptId=${attemptId}'" style="padding: 8px 20px; background: #1d4ed8; color: white; border: none; border-radius: 4px; font-weight: 600; font-size: 0.85rem; cursor: pointer;">
                            View Full Analytics <i class="fas fa-chart-pie ml-1"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        return;
    }

    if(currentBatchQuizzes.length === 0) {
        container.innerHTML = `<div class="empty-box" style="margin-top: 50px;"><i class="fas fa-clipboard-list" style="opacity:0.2;"></i><h4 style="margin-top:10px; font-weight:500;">No live assessments available.</h4></div>`;
        return;
    }
    
    currentBatchQuizzes.forEach(test => {
        window.testsDataCache[test.id] = test;
        const isAttempted = attemptedMap[test.id];
        
        let statusBadge = isAttempted 
            ? `<span style="color: #f59e0b; font-size: 0.75rem; font-weight: 800; background: #fef3c7; padding: 4px 8px; border-radius: 4px;"><i class="fas fa-redo"></i> Re-attempt Available</span>`
            : `<span style="color: #2563eb; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-circle" style="font-size: 0.4rem; vertical-align: middle; margin-right:4px;"></i> Active</span>`;

        let actionButtons = `<button onclick="openInstructions('${test.id}')" style="padding: 8px 20px; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: 600; font-size: 0.85rem; cursor: pointer;">${isAttempted ? 'Start Re-attempt' : 'Begin Assessment'}</button>`;

        let cardHtml = `
            <div style="background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">${test.subject || 'Standard Assessment'}</div>
                        <h3 style="font-size: 1.05rem; color: #0f172a; font-weight: 700; margin-bottom: 12px;">${test.title}</h3>
                    </div>
                    <div>${statusBadge}</div>
                </div>
                
                <div style="display: flex; gap: 20px; font-size: 0.8rem; color: #475569; font-weight: 500; margin-bottom: 16px;">
                    <span style="display: flex; align-items: center; gap: 5px;"><i class="fas fa-clock" style="color: #94a3b8;"></i> ${test.duration} Mins</span>
                    <span style="display: flex; align-items: center; gap: 5px;"><i class="fas fa-list-ol" style="color: #94a3b8;"></i> ${test.totalQuestions || 'N/A'} Qs</span>
                    <span style="display: flex; align-items: center; gap: 5px;"><i class="fas fa-bullseye" style="color: #94a3b8;"></i> ${test.maxMarks} Marks</span>
                </div>
                
                <div style="border-top: 1px solid #f1f5f9; padding-top: 12px; display: flex; justify-content: flex-end;">
                    ${actionButtons}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
};
window.currentActiveTestId = null;

window.openInstructions = (testId) => {
    const test = window.testsDataCache[testId];
    if(!test) return;
    
    window.currentActiveTestId = testId;
    
    document.getElementById('inst-title').innerText = test.title;
    
    const instSubject = document.getElementById('inst-subject');
    if (instSubject) instSubject.innerText = test.subject || 'Standard Assessment';
    
    document.getElementById('inst-time').innerText = test.duration + " Mins";
    document.getElementById('inst-marks').innerText = test.maxMarks;
    
    if(test.questions && test.questions.length > 0) {
        document.getElementById('inst-plus').innerText = `+${test.questions[0].marks?.correct || 4} Marks`;
        document.getElementById('inst-minus').innerText = `-${test.questions[0].marks?.incorrect || 1} Mark`;
    } else {
        document.getElementById('inst-plus').innerText = `+4 Marks`;
        document.getElementById('inst-minus').innerText = `-1 Mark`;
    }

    document.getElementById('instruction-mode').style.display = 'flex';
};

window.closeInstructions = () => {
    document.getElementById('instruction-mode').style.display = 'none';
    window.currentActiveTestId = null;
};

window.startTestPlayer = () => {
    if(!window.currentActiveTestId || !AppState.currentBatchId) {
        alert("Session error. Please reload the page."); return;
    }
    document.getElementById('instruction-mode').style.display = 'none';
    window.open(`portal.html?testId=${window.currentActiveTestId}&batchId=${AppState.currentBatchId}`, '_blank');
};


// ==========================================
// 6. INITIALIZATION 
// ==========================================
const setupDropdown = async (batchIds) => {
    const dropdown = document.getElementById('batch-dropdown');
    if(!dropdown) return;
    dropdown.innerHTML = '';
    
    const urlParams = new URLSearchParams(window.location.search);
    let targetBatchId = urlParams.get('batch');

    if (!targetBatchId) targetBatchId = AppState.currentBatchId;
    if (!targetBatchId && batchIds.length > 0) targetBatchId = batchIds[0];

    for (const bId of batchIds) {
        try {
            const bSnap = await getDoc(doc(db, "batches", bId));
            if (bSnap.exists()) { 
                const title = bSnap.data().title;
                dropdown.innerHTML += `<div class="dropdown-item" onclick="window.switchBatch('${bId}')">${title}</div>`; 
            }
        } catch (error) {
            console.error("Error fetching batch detail:", error);
        }
    }
    
    // 🚨 FIX: Kyunki ab window.switchBatch globally 100% available hai, 
    // Isliye complex setTimeout ki zaroorat nahi hai. Direct execute hoga.
    if (targetBatchId) {
        window.switchBatch(targetBatchId);
    }
};

VideoPlayer.initAPI();
initAuth((batches) => {
    setupDropdown(batches);
});
