// js/main.js
import { db } from './firebase-init.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initAuth, AppState } from './auth.js';
import { UI } from './ui.js';
import { VideoPlayer } from './player.js';
import { PDFViewer } from './pdf.js';

// ==========================================
// API GATEWAY
// ==========================================
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
// ROUTING ENGINE
// ==========================================
window.handleScreenRender = (screenId) => {
    UI.showScreen(screenId); 
    
    if (screenId === 'subjects') window.renderSubjects();
    if (screenId === 'chapters' && AppState.currentSubject) window.renderChapters(AppState.currentSubject);
    if (screenId === 'classroom' && AppState.currentChapter) window.filterClassroom('all');
    if (screenId === 'tests') window.renderTestsList('live'); 
};

// 🚨 HARDWARE BACK-BUTTON FIX: Hash change par hamesha modals aur overlays band honge
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
// BUSINESS LOGIC & SMART DATA FILTERING
// ==========================================
window.switchBatch = async (batchId) => {
    const batchNameEl = document.getElementById('current-batch-name');
    if (batchNameEl) batchNameEl.innerText = "Loading...";
    
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
        const batchSnap = await getDoc(doc(db, "batches", batchId));
        if (batchSnap.exists() && batchNameEl) batchNameEl.innerText = batchSnap.data().title;

        const matRef = collection(db, "batches", batchId, "materials");
        const q = query(matRef, where("status", "==", "Active"));
        const matSnap = await getDocs(q);

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
    } catch (error) { console.error("Batch Load Error:", error); }
};

window.switchTab = (btnElement, listId) => {
    UI.switchTabUI(btnElement);
    if (listId === 'resource-list') { 
        window.renderExtraMaterials('subject-list', AppState.globalResources, "No global resources available yet."); 
    } 
    else if (listId === 'subject-list') { window.renderSubjects(); } 
    else if (listId === 'chapter-material') { 
        const mats = AppState.subjectMaterials[AppState.currentSubject] || [];
        window.renderExtraMaterials('chapter-list', mats, "No extra material found for this subject."); 
    } 
    else if (listId === 'chapter-list') { window.renderChapters(AppState.currentSubject); }
};

window.renderExtraMaterials = (containerId, items, emptyMsg) => {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    
    if(!items || items.length === 0) {
        container.innerHTML = `<div class="empty-box"><i class="fas fa-folder-open"></i><h4>${emptyMsg}</h4></div>`;
        return;
    }
    
    items.forEach(mat => {
        let safeTitle = mat.title ? mat.title.replace(/['"\\]/g, "") : "Resource";
        let url = mat.pdfUrl || mat.linkUrl || mat.videoUrl || "";
        let safeUrl = url.replace(/['"\\]/g, "");
        
        let icon = 'fa-link'; let color = '#3B82F6'; let badge = 'LINK';
        if(mat.type === 'pdf') { icon = 'fa-file-pdf'; color = '#EF4444'; badge = 'PDF'; }
        if(mat.type === 'dpp') { icon = 'fa-tasks'; color = '#F59E0B'; badge = 'DPP'; }

        let btnHtml = `<button onclick="window.open('${safeUrl}', '_blank')" style="background: ${color}; border:none; padding: 6px 15px; color:white; border-radius:8px; font-weight:600; cursor:pointer;">Open</button>`;
        if(mat.type === 'pdf' || mat.type === 'dpp' || mat.pdfUrl) {
            btnHtml = `<button onclick="openPDF('${safeUrl}', '${safeTitle}')" style="background: ${color}; border:none; padding: 6px 15px; color:white; border-radius:8px; font-weight:600; cursor:pointer;">View</button>`;
        }

        container.innerHTML += `
            <div class="list-card">
                <div class="card-icon" style="background: ${color}15; color: ${color};"><i class="fas ${icon}"></i></div>
                <div class="card-info">
                    <div class="card-title">${mat.title}</div>
                    <div class="card-sub" style="margin-top:4px;"><span style="font-size:0.65rem; background:${color}20; color:${color}; padding:2px 6px; border-radius:4px; font-weight:800;">${badge}</span></div>
                </div>
                ${btnHtml}
            </div>`;
    });
};

window.renderSubjects = () => {
    const container = document.getElementById('subject-list');
    if(!container) return;
    container.innerHTML = ''; 

    const coreSubjects = Object.keys(AppState.materialsTree || {});
    const extraSubjects = Object.keys(AppState.subjectMaterials || {});
    const subjects = [...new Set([...coreSubjects, ...extraSubjects])];

    if (subjects.length === 0) { 
        container.innerHTML = `<div class="empty-box"><i class="fas fa-book"></i><h4>No subjects assigned.</h4></div>`; 
        return; 
    }
    
    subjects.forEach(subject => { 
        container.innerHTML += `<div class="list-card" onclick="navigate('chapters', {subject: '${subject}'})"><div class="card-icon">${subject.substring(0, 2).toUpperCase()}</div><div class="card-info"><div class="card-title">${subject}</div><div class="card-sub">Access materials & lectures</div></div><i class="fas fa-chevron-right" style="color: var(--text-light);"></i></div>`; 
    });
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
        if (actualPdfUrl && (filterType === 'all' || filterType === 'notes')) {
            btns += `<button class="action-btn" onclick="openPDF('${safePdf}', '${safeTitle}')" style="background: transparent; color: inherit; border: 1px solid var(--border);"><i class="fas fa-file-pdf" style="color: #EF4444;"></i> Document</button>`;
        }
        if (mat.videoUrl && (filterType === 'all' || filterType === 'lectures')) {
            let attach = mat.attachedPdfUrl ? mat.attachedPdfUrl.replace(/['"\\]/g, "") : "";
            btns += `<button class="action-btn play" onclick="openVideo('${safeVid}', '${safeTitle}', '${attach}')"><i class="fas fa-play"></i> Watch</button>`;
        }
        
        container.innerHTML += `<div class="lecture-card"><div class="lec-top"><div class="card-info"><div class="card-title" style="white-space: normal;">${mat.title}</div><div class="card-sub" style="margin-top: 5px;"><i class="fas fa-bookmark"></i> Academic Material</div></div></div><div class="lec-actions">${btns}</div></div>`;
    });
};

window.switchClassroomTab = (type) => {
    const content = document.getElementById('classroom-dynamic-content');
    if(!content) return;
    
    const tabComm = document.getElementById('tab-comments');
    const tabNotes = document.getElementById('tab-notes');
    const targetTab = document.getElementById('tab-' + type);
    
    if(tabComm) tabComm.classList.remove('active');
    if(tabNotes) tabNotes.classList.remove('active');
    if(targetTab) targetTab.classList.add('active');

    if (type === 'comments') {
        content.innerHTML = `
            <div style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem;">Academic Discussion</div>
            <div class="comment-card">
                <div class="user-avatar">AS</div>
                <div class="comment-body">
                    <div class="comment-user">Student <span style="font-weight: 400; opacity: 0.6; font-size: 0.7rem; margin-left: 10px;">Recent</span></div>
                    <div class="comment-text">The conceptual breakdown in this lecture was highly effective.</div>
                </div>
            </div>
            <div style="position: sticky; bottom: 0; background: white; padding-top: 10px;">
                <input type="text" placeholder="Post a query..." style="width: 100%; padding: 12px; border-radius: 25px; border: 1px solid var(--border); outline: none;">
            </div>
        `;
    } else if (type === 'notes') {
        const pdf = VideoPlayer.currentClassroomData ? (VideoPlayer.currentClassroomData.attachedPdfUrl || VideoPlayer.currentClassroomData.pdfUrl) : '';
        
        if (pdf && pdf !== 'undefined' && pdf !== '') {
            let safeTitle = VideoPlayer.currentClassroomData.title ? VideoPlayer.currentClassroomData.title.replace(/['"\\]/g, "") : "Study Notes";
            let safePdf = pdf.replace(/['"\\]/g, "");
            
            content.innerHTML = `
                <div style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem;">Associated Documentation</div>
                <div class="list-card" style="background: #fdf2f2; border-color: #fecaca;">
                    <div class="card-icon" style="background: #ef4444; color: white;"><i class="fas fa-file-pdf"></i></div>
                    <div class="card-info">
                        <div class="card-title">Class_Notes.pdf</div>
                        <div class="card-sub">Select to view</div>
                    </div>
                    <button onclick="openPDF('${safePdf}', '${safeTitle}')" style="background: #ef4444; border:none; padding: 8px 15px; color:white; border-radius:8px; font-weight:600; cursor:pointer;">Access</button>
                </div>
            `;
        } else {
            content.innerHTML = `<div class="empty-box"><i class="fas fa-file-excel"></i><h4>No supplementary materials attached.</h4></div>`;
        }
    }
};

// ==========================================
// TEST ENGINE LOGIC
// ==========================================
window.testsDataCache = {};
window.userAttemptedQuizzes = {}; 

window.switchTestTab = (type, btn) => {
    UI.switchTabUI(btn);
    window.renderTestsList(type);
};

window.renderTestsList = (type = 'live') => {
    const container = document.getElementById('test-list-container');
    if(!container) return;
    
    const allTests = AppState.quizzes || [];
    
    if(allTests.length === 0) {
        container.innerHTML = `<div class="empty-box" style="margin-top: 50px;"><i class="fas fa-clipboard-list" style="font-size:3rem; opacity:0.2;"></i><h4 style="margin-top:15px;">No assessments assigned.</h4></div>`;
        return;
    }

    container.innerHTML = '';
    
    allTests.forEach(test => {
        window.testsDataCache[test.id] = test;
        
        // 🚨 MAGIC UX FIX: Ab engine session storage check karke turant "Completed" kar dega
        const isAttempted = window.userAttemptedQuizzes[test.id] || sessionStorage.getItem('submitted_' + test.id) ? true : false;
        
        if(type === 'live' && isAttempted) return;
        if(type === 'attempted' && !isAttempted) return;

        let statusBadge = isAttempted 
            ? `<span style="background: #fee2e2; color: #ef4444; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800;"><i class="fas fa-lock"></i> Completed</span>`
            : `<span style="background: #ecfdf5; color: #10b981; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800;"><i class="fas fa-circle" style="font-size: 0.5rem; margin-right: 4px; vertical-align: middle;"></i> Live</span>`;

        let actionButtons = isAttempted
            ? `<button onclick="alert('Result Dashboard Coming Soon!')" style="flex: 1; padding: 10px; border-radius: 8px; background: #f1f5f9; color: var(--navy); border: 1px solid #cbd5e1; font-weight: 700; cursor: pointer;"><i class="fas fa-chart-bar"></i> View Result</button>
               <button onclick="openInstructions('${test.id}')" style="flex: 1; padding: 10px; border-radius: 8px; background: white; color: var(--primary); border: 1px solid var(--primary); font-weight: 700; cursor: pointer;"><i class="fas fa-redo"></i> Reattempt</button>`
            : `<button onclick="openInstructions('${test.id}')" style="width: 100%; padding: 12px; border-radius: 8px; background: var(--primary); color: white; border: none; font-weight: 800; font-size: 1rem; cursor: pointer; box-shadow: 0 4px 10px rgba(37,99,235,0.2);">Start Test <i class="fas fa-arrow-right"></i></button>`;

        let cardHtml = `
            <div class="premium-card" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.03);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                    <div style="width: 75%;">
                        <span style="font-size:0.7rem; font-weight:800; background:#e0e7ff; color:#4f46e5; padding:4px 8px; border-radius:6px; margin-bottom:10px; display:inline-block; text-transform: uppercase;">${test.subject || 'Full Mock Test'}</span>
                        <h3 style="font-size: 1.15rem; color: var(--navy); font-weight: 800; line-height: 1.4;">${test.title}</h3>
                    </div>
                    <div>${statusBadge}</div>
                </div>
                
                <div style="display: flex; gap: 10px; font-size: 0.8rem; color: var(--text-light); font-weight: 700; margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 10px; border: 1px solid #f1f5f9; justify-content: space-around;">
                    <div style="text-align: center;"><i class="fas fa-clock" style="color: var(--primary); font-size: 1rem; margin-bottom: 5px; display: block;"></i> ${test.duration} Min</div>
                    <div style="width: 1px; background: #e2e8f0;"></div>
                    <div style="text-align: center;"><i class="fas fa-question-circle" style="color: #f59e0b; font-size: 1rem; margin-bottom: 5px; display: block;"></i> ${test.totalQuestions} Qs</div>
                    <div style="width: 1px; background: #e2e8f0;"></div>
                    <div style="text-align: center;"><i class="fas fa-star" style="color: #10b981; font-size: 1rem; margin-bottom: 5px; display: block;"></i> ${test.maxMarks} Marks</div>
                </div>
                
                <div style="display: flex; gap: 10px;">
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
    document.getElementById('inst-time').innerText = test.duration + " Mins";
    document.getElementById('inst-marks').innerText = test.maxMarks;
    
    if(test.questions && test.questions.length > 0) {
        document.getElementById('inst-plus').innerText = `+${test.questions[0].marks.correct} Marks`;
        document.getElementById('inst-minus').innerText = `-${test.questions[0].marks.incorrect} Mark`;
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
        alert("Session validation failed. Please refresh."); return;
    }
    
    // 🚨 BCACHE KILLER FIX: Modal ko exam page pe jaane se pehle hi hide kardo 
    // Taaki browser isko galti se 'khula hua' save na kare.
    document.getElementById('instruction-mode').style.display = 'none';
    
    window.location.href = `exam.html?testId=${window.currentActiveTestId}&batchId=${AppState.currentBatchId}`;
};

// ==========================================
// INITIALIZATION
// ==========================================
const setupDropdown = (batchIds) => {
    const dropdown = document.getElementById('batch-dropdown');
    if(!dropdown) return;
    dropdown.innerHTML = '';
    batchIds.forEach(async (bId) => {
        const bSnap = await getDoc(doc(db, "batches", bId));
        if (bSnap.exists()) { 
            dropdown.innerHTML += `<div class="dropdown-item" onclick="window.switchBatch('${bId}')">${bSnap.data().title}</div>`; 
        }
    });
};

VideoPlayer.initAPI();
initAuth((batches) => {
    setupDropdown(batches);
    let bToLoad = AppState.currentBatchId || batches[batches.length - 1];
    window.switchBatch(bToLoad); 
});
