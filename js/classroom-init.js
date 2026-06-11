// js/classroom-init.js
import { VideoPlayer } from './player/index.js';
import { CommentEngine } from './comments.js';
import { PDFViewer } from './pdf.js';

// EXACT TUMHARI ORIGINAL TABS WALI FUNCTIONALITY
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
        let stableLectureId = "general_discussion";
        if (window.vp_currentChapter) {
            stableLectureId = "lec_" + window.vp_currentChapter.replace(/\s+/g, '_');
        }
        CommentEngine.renderUI(content, stableLectureId);
    } else if (type === 'notes') {
        const pdf = VideoPlayer.currentClassroomData ? (VideoPlayer.currentClassroomData.attachedPdfUrl || VideoPlayer.currentClassroomData.pdfUrl) : '';
        if (pdf && pdf !== 'undefined' && pdf !== '') {
            let safeTitle = VideoPlayer.currentClassroomData.title ? VideoPlayer.currentClassroomData.title.replace(/['"\\]/g, "") : "Study Notes"; 
            let safePdf = pdf.replace(/['"\\]/g, "");
            content.innerHTML = `<div style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem;">Associated Documentation</div><div class="list-card" style="background: #fdf2f2; border-color: #fecaca;"><div class="card-icon" style="background: #ef4444; color: white;"><i class="fas fa-file-pdf"></i></div><div class="card-info"><div class="card-title">Class_Notes.pdf</div><div class="card-sub">Select to view</div></div><button onclick="openPDF('${safePdf}', '${safeTitle}')" style="background: #ef4444; border:none; padding: 8px 15px; color:white; border-radius:8px; font-weight:600; cursor:pointer;">Access</button></div>`;
        } else { 
            content.innerHTML = `<div class="empty-box"><i class="fas fa-file-excel"></i><h4>No supplementary materials attached.</h4></div>`; 
        }
    }
};

window.openPDF = PDFViewer.openPDF;
window.closePDF = PDFViewer.closePDF;
window.togglePDFFull = PDFViewer.togglePDFFull;

// Page load hone par URL parameters se video start karna
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const vidUrl = urlParams.get('v');
    const title = urlParams.get('title') || 'Classroom Lecture';
    const pdfUrl = urlParams.get('pdf') || '';
    
    // Store chapter name globally for CommentEngine
    window.vp_currentChapter = urlParams.get('chapter') || 'General';

    if (vidUrl) {
        VideoPlayer.openVideo(vidUrl, title, pdfUrl);
        window.switchClassroomTab('comments');
    }
});

