import { db, auth } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

window.currentBatchId = localStorage.getItem('vp_batch') || null;
window.currentSubject = localStorage.getItem('vp_subject') || null;
window.currentChapter = localStorage.getItem('vp_chapter') || null;
window.materialsTree = {}; 

const ytScript = document.createElement('script');
ytScript.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytScript);
window.ytPlayer = null;
window.ytProgressInterval = null;

window.formatTime = (time) => {
    if(isNaN(time)) return "0:00";
    let min = Math.floor(time / 60);
    let sec = Math.floor(time % 60);
    return min + ":" + (sec < 10 ? "0" + sec : sec);
};
    
window.togglePlay = () => {
    if(!window.ytPlayer || !window.ytPlayer.getPlayerState) return;
    if(window.ytPlayer.isMuted()) {
        window.ytPlayer.unMute();
        document.getElementById('mute-icon').className = "fas fa-volume-up";
    }
    let state = window.ytPlayer.getPlayerState();
    let icon = document.getElementById('play-icon');
    if (state === 1) { 
        window.ytPlayer.pauseVideo();
        icon.className = "fas fa-play";
    } else { 
        window.ytPlayer.playVideo();
        icon.className = "fas fa-pause";
    }
};

window.toggleMute = () => {
    if(!window.ytPlayer) return;
    let icon = document.getElementById('mute-icon');
    if (window.ytPlayer.isMuted()) {
        window.ytPlayer.unMute();
        icon.className = "fas fa-volume-up";
    } else {
        window.ytPlayer.mute();
        icon.className = "fas fa-volume-mute";
    }
};

window.toggleFullScreen = () => {
    let container = document.getElementById('video-container');
    if (!document.fullscreenElement) {
        if(container.requestFullscreen) container.requestFullscreen();
        else if(container.webkitRequestFullscreen) container.webkitRequestFullscreen(); 
    } else {
        if(document.exitFullscreen) document.exitFullscreen();
        else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
};

window.openMenu = () => { document.getElementById('global-overlay').style.display = 'block'; document.getElementById('menu-modal').style.display = 'flex'; };
window.openNotif = () => { document.getElementById('global-overlay').style.display = 'block'; document.getElementById('notif-modal').style.display = 'flex'; };
window.closeModals = () => { document.getElementById('global-overlay').style.display = 'none'; document.getElementById('menu-modal').style.display = 'none'; document.getElementById('notif-modal').style.display = 'none'; document.getElementById('batch-dropdown').classList.remove('show'); };
window.toggleDropdown = (e) => { e.stopPropagation(); document.getElementById('batch-dropdown').classList.toggle('show'); };
document.addEventListener('click', (e) => { const dropdown = document.getElementById('batch-dropdown'); if (dropdown && dropdown.classList.contains('show') && !e.target.closest('.batch-selector')) dropdown.classList.remove('show'); });

const showScreen = (screenId) => {
    closeModals();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    if (screenId === 'subjects') renderSubjects();
    if (screenId === 'chapters' && window.currentSubject) renderChapters(window.currentSubject);
    if (screenId === 'classroom' && window.currentChapter) filterClassroom('all');
};

window.navigate = (screenId, payload = {}) => {
    if (payload.subject) { window.currentSubject = payload.subject; localStorage.setItem('vp_subject', payload.subject); }
    if (payload.chapter) { window.currentChapter = payload.chapter; localStorage.setItem('vp_chapter', payload.chapter); }
    window.location.hash = screenId;
};

window.addEventListener('hashchange', () => { showScreen(window.location.hash.replace('#', '') || 'dashboard'); });

// 🚨 THE MASTER BUG FIX: Popstate handles everything automatically!
window.addEventListener('popstate', (e) => {
    const pdfOverlay = document.getElementById('pdf-mode');
    const classOverlay = document.getElementById('classroom-mode');
    
    // Agar PDF khula hai, toh pehle sirf PDF band hoga
    if (pdfOverlay && pdfOverlay.classList.contains('active')) {
        pdfOverlay.classList.remove('active');
        document.getElementById('pdf-iframe').src = "";
    } 
    // Agar PDF nahi hai aur Video khula hai, toh Video band hoga
    else if (classOverlay && classOverlay.classList.contains('active')) {
        classOverlay.classList.remove('active');
        if(window.ytPlayer && window.ytPlayer.pauseVideo) window.ytPlayer.pauseVideo();
    }
});

window.switchBatch = async (batchId) => {
    document.getElementById('current-batch-name').innerText = "Loading...";
    localStorage.setItem('vp_batch', batchId);
    window.currentBatchId = batchId;
    
    const initialScreen = window.location.hash.replace('#', '') || 'dashboard';
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(initialScreen);
    if (target) target.classList.add('active');

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

        window.materialsTree = {};
        matSnap.forEach(docSnap => {
            const data = docSnap.data();
            const subject = data.subject || "General", chapter = data.chapter || "Uncategorized";
            if (!window.materialsTree[subject]) window.materialsTree[subject] = {};
            if (!window.materialsTree[subject][chapter]) window.materialsTree[subject][chapter] = [];
            window.materialsTree[subject][chapter].push(data);
        });
        showScreen(initialScreen);
    } catch (error) { console.error("Batch Load Error:", error); }
};

const fetchUserBatches = async (uid) => {
    try {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) {
            const batchIds = userSnap.data().enrolledBatches || [];
            if (batchIds.length === 0) { window.location.replace('explore.html'); return; }
            const dropdown = document.getElementById('batch-dropdown');
            dropdown.innerHTML = '';
            for (let bId of batchIds) {
                const bSnap = await getDoc(doc(db, "batches", bId));
                if (bSnap.exists()) { dropdown.innerHTML += `<div class="dropdown-item" onclick="switchBatch('${bId}')">${bSnap.data().title}</div>`; }
            }
            let bToLoad = localStorage.getItem('vp_batch') || batchIds[batchIds.length - 1];
            await switchBatch(bToLoad);
        }
    } catch (error) { console.error("Auth Error:", error); }
};

const initApp = () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const name = user.displayName || user.email.split('@')[0];
            document.getElementById('userName').innerText = name;
            document.getElementById('userIcon').innerText = name.charAt(0).toUpperCase();
            await fetchUserBatches(user.uid);
        } else { window.location.replace("login.html"); }
    });
};

window.switchTab = (btnElement, listId) => {
    const tabs = btnElement.parentElement.children;
    for(let t of tabs) { t.classList.remove('active'); }
    btnElement.classList.add('active');
    if (listId === 'resource-list') { document.getElementById('subject-list').innerHTML = `<div class="empty-box"><i class="fas fa-folder-open"></i><h4>No resources currently available.</h4></div>`; } 
    else if (listId === 'subject-list') { renderSubjects(); } 
    else if (listId === 'chapter-material') { document.getElementById('chapter-list').innerHTML = `<div class="empty-box"><i class="fas fa-file-alt"></i><h4>No material found for this subject.</h4></div>`; } 
    else if (listId === 'chapter-list') { renderChapters(window.currentSubject); }
};

const renderSubjects = () => {
    const container = document.getElementById('subject-list');
    if(!container) return;
    container.innerHTML = ''; 
    const subjects = Object.keys(window.materialsTree);
    if (subjects.length === 0) { container.innerHTML = `<div class="empty-box"><i class="fas fa-book"></i><h4>No subjects assigned.</h4></div>`; return; }
    subjects.forEach(subject => { container.innerHTML += `<div class="list-card" onclick="navigate('chapters', {subject: '${subject}'})"><div class="card-icon">${subject.substring(0, 2).toUpperCase()}</div><div class="card-info"><div class="card-title">${subject}</div><div class="card-sub">Access materials</div></div><i class="fas fa-chevron-right" style="color: var(--text-light);"></i></div>`; });
};

const renderChapters = (subjectName) => {
    const container = document.getElementById('chapter-list');
    if(!container) return;
    document.getElementById('dyn-subject-title').innerText = subjectName;
    container.innerHTML = '';
    const chaptersObj = window.materialsTree[subjectName];
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
    if(btnElement) { const tabs = btnElement.parentElement.children; for(let t of tabs) { t.classList.remove('active'); } btnElement.classList.add('active'); }
    document.getElementById('dyn-chapter-title').innerText = window.currentChapter;
    container.innerHTML = '';
    const allMaterials = window.materialsTree[window.currentSubject]?.[window.currentChapter];
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
    window.openVideo = (vidUrl, title, pdfUrl) => {
    if(!vidUrl) return alert("Playback URL is invalid.");
    let match = vidUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
    let vidId = match ? match[1] : vidUrl;
    
    if(typeof YT === 'undefined' || !YT.Player) return alert("Player initialization in progress. Please wait a moment.");

    document.getElementById('play-icon').className = "fas fa-pause";
    document.getElementById('progress-fill').style.width = "0%";
    document.getElementById('time-display').innerText = "0:00";
    
    const overlay = document.getElementById('classroom-mode');
    
    if (!overlay.classList.contains('active')) {
        window.history.pushState({ videoOpen: true }, '', window.location.href);
        overlay.classList.add('active');
    }

    window.currentClassroomData = { title, pdfUrl };
    switchClassroomTab('comments');

    let userEmail = auth.currentUser ? auth.currentUser.email : "Authenticated User";
    document.getElementById('video-watermark').innerText = userEmail + " | VidyaPlus";

    if (window.ytPlayer && typeof window.ytPlayer.destroy === 'function') {
        window.ytPlayer.destroy();
        window.ytPlayer = null;
    }
    
    window.ytPlayer = new YT.Player('vp-player', {
        videoId: vidId,
        playerVars: { 'autoplay': 1, 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0, 'showinfo': 0, 'playsinline': 1, 'origin': window.location.origin, 'mute': 1 },
        events: {
            'onReady': (event) => { 
                event.target.playVideo(); 
                if(window.ytProgressInterval) clearInterval(window.ytProgressInterval);
                window.ytProgressInterval = setInterval(window.updateProgressBar, 500);
            },
            'onStateChange': (event) => {
                let icon = document.getElementById('play-icon');
                if(event.data === 1) { 
                    icon.className = "fas fa-pause"; 
                    if(typeof window.showUI === 'function') window.showUI(); 
                } else { 
                    icon.className = "fas fa-play"; 
                    if(typeof window.showUI === 'function') window.showUI(); 
                }
            }
        }
    });
};

window.closeClassroom = () => {
    const overlay = document.getElementById('classroom-mode');
    if (overlay.classList.contains('active')) {
        // Sirf browser ko back jane bolo, Popstate baki sambhal lega!
        window.history.back(); 
    }
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
        const pdf = window.currentClassroomData.pdfUrl;
        if (pdf && pdf !== 'undefined' && pdf !== '') {
            let safeTitle = window.currentClassroomData.title ? window.currentClassroomData.title.replace(/['"\\]/g, "") : "Study Notes";
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || (e.ctrlKey && e.key === 'U')) { e.preventDefault(); return false; }
});

window.updateProgressBar = () => {
    if(window.ytPlayer && window.ytPlayer.getCurrentTime && !window.isDragging) {
        let current = window.ytPlayer.getCurrentTime();
        let duration = window.ytPlayer.getDuration();
        let percentage = (current / duration) * 100;
        document.getElementById('progress-fill').style.width = percentage + "%";
        document.getElementById('time-display').innerText = window.formatTime(current);
    }
};

window.skipVideo = (seconds) => {
    if(!window.ytPlayer || !window.ytPlayer.getCurrentTime) return;
    let newTime = window.ytPlayer.getCurrentTime() + seconds;
    window.ytPlayer.seekTo(newTime, true);
};

window.toggleSettings = (e) => { 
    e.stopPropagation(); 
    document.getElementById('settings-menu').classList.toggle('show'); 
};

document.addEventListener('click', (e) => {
    const menu = document.getElementById('settings-menu');
    if (menu && menu.classList.contains('show') && !e.target.closest('.custom-controls')) {
        menu.classList.remove('show');
    }
});

window.setSpeed = (rate) => {
    if(!window.ytPlayer || !window.ytPlayer.setPlaybackRate) return;
    window.ytPlayer.setPlaybackRate(rate);
    document.querySelectorAll('.speed-opt').forEach(el => el.classList.remove('active'));
    document.getElementById('spd-' + rate).classList.add('active');
};

window.isDragging = false;
window.startDrag = (e) => { window.isDragging = true; window.updateScrub(e); };
window.stopDrag = (e) => { if(window.isDragging) { window.updateScrub(e); window.isDragging = false; } };
window.doDrag = (e) => { if(window.isDragging) window.updateScrub(e); };

window.updateScrub = (e) => {
    if(!window.ytPlayer || !window.ytPlayer.getDuration) return;
    let bg = document.getElementById('progress-bg');
    let rect = bg.getBoundingClientRect();
    let clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : (e.clientX || 0);
    if(clientX === 0 && e.changedTouches) clientX = e.changedTouches[0].clientX; 
    let clickX = clientX - rect.left;
    let percentage = Math.max(0, Math.min(1, clickX / rect.width));
    let duration = window.ytPlayer.getDuration();
    window.ytPlayer.seekTo(percentage * duration, true);
    document.getElementById('progress-fill').style.width = (percentage * 100) + "%";
    document.getElementById('time-display').innerText = window.formatTime(percentage * duration);
};

window.uiTimeout = null;
let lastMouseX = -1;
let lastMouseY = -1;

window.showUI = (e) => {
    if (e && e.type === 'mousemove') {
        if (e.clientX === lastMouseX && e.clientY === lastMouseY) return; 
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
    const controls = document.getElementById('custom-controls');
    const backBtn = document.querySelector('.close-classroom');
    if(controls) controls.classList.remove('hidden');
    if(backBtn) backBtn.classList.remove('hidden');
    clearTimeout(window.uiTimeout);
    let state = window.ytPlayer && window.ytPlayer.getPlayerState ? window.ytPlayer.getPlayerState() : -1;
    if (state === 1) { 
        window.uiTimeout = setTimeout(() => {
            const menu = document.getElementById('settings-menu');
            if (menu && menu.classList.contains('show')) return; 
            if(controls) controls.classList.add('hidden');
            if(backBtn) backBtn.classList.add('hidden');
        }, 5000); 
    }
};

window.handleShieldClick = () => {
    const controls = document.getElementById('custom-controls');
    if(controls && controls.classList.contains('hidden')) {
        window.showUI();
    } else {
        window.togglePlay();
    }
};

const vContainer = document.getElementById('video-container');
if(vContainer) {
    vContainer.addEventListener('mousemove', window.showUI);
    vContainer.addEventListener('touchstart', window.showUI);
    vContainer.addEventListener('click', window.showUI);
}

// 📄 PREMIUM PDF VIEWER LOGIC
window.openPDF = (url, title) => {
    if(!url || url === 'undefined') return alert("PDF link is missing or empty!");
    let finalUrl = url;
    if(url.includes('drive.google.com')) {
        if(url.includes('/view')) finalUrl = url.replace('/view', '/preview');
        else if(url.includes('?id=')) {
            let id = url.split('id=')[1].split('&')[0];
            finalUrl = `https://drive.google.com/file/d/${id}/preview`;
        }
    }
    document.getElementById('pdf-dyn-title').innerText = title;
    document.getElementById('pdf-iframe').src = finalUrl;
    let userEmail = auth.currentUser ? auth.currentUser.email : "Vidyaplus User";
    document.getElementById('pdf-watermark-text').innerText = userEmail;
    
    const overlay = document.getElementById('pdf-mode');
    
    // Exact Video Player Logic: History add karo agar already open nahi hai
    if (!overlay.classList.contains('active')) {
        window.history.pushState({ pdfOpen: true }, '', window.location.href);
        overlay.classList.add('active');
    }
};

window.closePDF = () => {
    const overlay = document.getElementById('pdf-mode');
    // Exact Video Player Logic: Sirf browser ko back bhejo, UI Popstate khud band karega
    if (overlay.classList.contains('active')) {
        window.history.back(); 
    }
};

window.togglePDFFull = () => {
    let elem = document.getElementById('pdf-viewer-container');
    if (!document.fullscreenElement) elem.requestFullscreen();
    else document.exitFullscreen();
};

initApp();
                                                 
