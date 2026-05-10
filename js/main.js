// js/main.js
import { db } from './firebase-init.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initAuth, AppState } from './auth.js';
import { UI } from './ui.js';
import { VideoPlayer } from './player.js';
import { PDFViewer } from './pdf.js';

// 🌟 API GATEWAY: Modules ko HTML files se connect karna
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
window.openVideo = VideoPlayer.openVideo;

window.openPDF = PDFViewer.openPDF;
window.closePDF = PDFViewer.closePDF;
window.togglePDFFull = PDFViewer.togglePDFFull;

// 🚦 ROUTING & POPSTATE (History Manager)
window.addEventListener('hashchange', () => { 
    UI.showScreen(window.location.hash.replace('#', '') || 'dashboard'); 
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

// 🧠 BUSINESS LOGIC (Data Fetching & Rendering)
window.switchBatch = async (batchId) => {
    document.getElementById('current-batch-name').innerText = "Loading...";
    localStorage.setItem('vp_batch', batchId);
    AppState.currentBatchId = batchId;
    
    const initialScreen = window.location.hash.replace('#', '') || 'dashboard';
    UI.showScreen(initialScreen);

    const skeletonHTML = `<div class="list-card" style="border:none; box-shadow:none; padding:15px 0;"><div class="skeleton" style="width:45px; height:45px; border-radius:10px; flex-shrink:0;"></div><div style="flex:1;"><div class="skeleton" style="height:16px; width:70%; margin-bottom:8px; border-radius:4px;"></div><div class="skeleton" style="height:12px; width:40%; border-radius:4px;"></div></div></div>`.repeat(5);
    if(initialScreen === 'subjects') document.getElementById('subject-list').innerHTML = skeletonHTML;
    if(initialScreen === 'chapters') document.getElementById('chapter-list').innerHTML = skeletonHTML;
    if(initialScreen === 'classroom') document.getElementById('lecture-list').innerHTML = skeletonHTML;

    try {
        const batchSnap = await getDoc(doc(db, "batches", batchId));
        if (batchSnap.exists()) document.getElementById('current-batch-name').innerText = batchSnap.data().title;

        const matRef = collection(db, "batches", batchId, "materials");
        const q = query(matRef, where("status", "==", "Active"));
        const matSnap = await getDocs(q);

        AppState.materialsTree = {};
        matSnap.forEach(docSnap => {
            const data = docSnap.data();
            const subject = data.subject || "General", chapter = data.chapter || "Uncategorized";
            if (!AppState.materialsTree[subject]) AppState.materialsTree[subject] = {};
            if (!AppState.materialsTree[subject][chapter]) AppState.materialsTree[subject][chapter] = [];
            AppState.materialsTree[subject][chapter].push(data);
        });
        UI.showScreen(initialScreen);
    } catch (error) { console.error("Batch Load Error:", error); }
};

window.switchTab = (btnElement, listId) => {
    UI.switchTabUI(btnElement);
    if (listId === 'resource-list') { document.getElementById('subject-list').innerHTML = `<div class="empty-box"><i class="fas fa-folder-open"></i><h4>No resources currently available.</h4></div>`; } 
    else if (listId === 'subject-list') { window.renderSubjects(); } 
    else if (listId === 'chapter-material') { document.getElementById('chapter-list').innerHTML = `<div class="empty-box"><i class="fas fa-file-alt"></i><h4>No material found for this subject.</h4></div>`; } 
    else if (listId === 'chapter-list') { window.renderChapters(AppState.currentSubject); }
};

window.renderSubjects = () => {
    const container = document.getElementById('subject-list');
    if(!container) return;
    container.innerHTML = ''; 
    const subjects = Object.keys(AppState.materialsTree);
    if (subjects.length === 0) { container.innerHTML = `<div class="empty-box"><i class="fas fa-book"></i><h4>No subjects assigned.</h4></div>`; return; }
    subjects.forEach(subject => { container.innerHTML += `<div class="list-card" onclick="navigate('chapters', {subject: '${subject}'})"><div class="card-icon">${subject.substring(0, 2).toUpperCase()}</div><div class="card-info"><div class="card-title">${subject}</div><div class="card-sub">Access materials</div></div><i class="fas fa-chevron-right" style="color: var(--text-light);"></i></div>`; });
};

window.renderChapters = (subjectName) => {
    const container = document.getElementById('chapter-list');
    if(!container) return;
    document.getElementById('dyn-subject-title').innerText = subjectName;
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
    document.getElementById('dyn-chapter-title').innerText = AppState.currentChapter;
    container.innerHTML = '';
    const allMaterials = AppState.materialsTree[AppState.currentSubject]?.[AppState.currentChapter];
    if (!allMaterials) return;
    let items = allMaterials;
    if(filterType === 'lectures') items = allMaterials.filter(m => m.videoUrl);
    if(filterType === 'notes') items = allMaterials.filter(m => m.pdfUrl);
    if (items.length === 0) { container.innerHTML = `<div class="empty-box"><i class="fas fa-search"></i><h4>No relevant content found.</h4></div>`; return; }
    
    items.forEach(mat => {
        let safeTitle = mat.title ? mat.title.replace(/['"\\]/g, "") : "Study Material";
        let safePdf = mat.pdfUrl ? mat.pdfUrl.replace(/['"\\]/g, "") : "";
        let safeVid = mat.videoUrl ? mat.videoUrl.replace(/['"\\]/g, "") : "";
        
        let btns = '';
        if (mat.pdfUrl && (filterType === 'all' || filterType === 'notes')) {
            btns += `<button class="action-btn" onclick="openPDF('${safePdf}', '${safeTitle}')" style="background: transparent; color: inherit; border: 1px solid var(--border);"><i class="fas fa-file-pdf" style="color: #EF4444;"></i> Document</button>`;
        }
        if (mat.videoUrl && (filterType === 'all' || filterType === 'lectures')) {
            btns += `<button class="action-btn play" onclick="openVideo('${safeVid}', '${safeTitle}', '${safePdf}')"><i class="fas fa-play"></i> Watch</button>`;
        }
        container.innerHTML += `<div class="lecture-card"><div class="lec-top"><div class="card-info"><div class="card-title" style="white-space: normal;">${mat.title}</div><div class="card-sub" style="margin-top: 5px;"><i class="fas fa-bookmark"></i> Academic Material</div></div></div><div class="lec-actions">${btns}</div></div>`;
    });
};

window.switchClassroomTab = (type) => {
    const content = document.getElementById('classroom-dynamic-content');
    document.getElementById('tab-comments').classList.remove('active');
    document.getElementById('tab-notes').classList.remove('active');
    document.getElementById('tab-' + type).classList.add('active');

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
        const pdf = VideoPlayer.currentClassroomData ? VideoPlayer.currentClassroomData.pdfUrl : '';
        if (pdf && pdf !== 'undefined' && pdf !== '') {
            let safeTitle = VideoPlayer.currentClassroomData.title ? VideoPlayer.currentClassroomData.title.replace(/['"\\]/g, "") : "Study Notes";
            let safePdf = pdf.replace(/['"\\]/g, "");
            
            content.innerHTML = `
                <div style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem;">Associated Documentation</div>
                <div class="list-card" style="background: #fdf2f2; border-color: #fecaca;">
                    <div class="card-icon" style="background: #ef4444; color: white;"><i class="fas fa-file-pdf"></i></div>
                    <div class="card-info">
                        <div class="card-title">Reference Material.pdf</div>
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

// 🚀 INITIALIZATION ALGORITHM
const setupDropdown = (batchIds) => {
    const dropdown = document.getElementById('batch-dropdown');
    if(!dropdown) return;
    dropdown.innerHTML = '';
    batchIds.forEach(async (bId) => {
        const bSnap = await getDoc(doc(db, "batches", bId));
        if (bSnap.exists()) { 
            dropdown.innerHTML += `<div class="dropdown-item" onclick="switchBatch('${bId}')">${bSnap.data().title}</div>`; 
        }
    });
};

VideoPlayer.initAPI();
initAuth((batches) => {
    setupDropdown(batches);
    let bToLoad = AppState.currentBatchId || batches[batches.length - 1];
    switchBatch(bToLoad);
});
      
