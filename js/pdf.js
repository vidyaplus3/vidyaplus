// js/pdf.js
import { auth } from './firebase-init.js';

export const PDFViewer = {
    openPDF: (url, title) => {
        if(!url || url === 'undefined') return alert("PDF link is missing or empty!");
        let finalUrl = url;
        
        // Google Drive link fixer
        if(url.includes('drive.google.com')) {
            if(url.includes('/view')) finalUrl = url.replace('/view', '/preview');
            else if(url.includes('?id=')) {
                let id = url.split('id=')[1].split('&')[0];
                finalUrl = `https://drive.google.com/file/d/${id}/preview`;
            }
        }
        
        document.getElementById('pdf-dyn-title').innerText = title;
        
        // 🚨 DYNAMIC IFRAME: Purana kachra hatao aur fresh banao
        const container = document.getElementById('pdf-viewer-container');
        let oldIframe = document.getElementById('pdf-iframe');
        if (oldIframe) oldIframe.remove();
        
        let newIframe = document.createElement('iframe');
        newIframe.id = 'pdf-iframe';
        newIframe.allow = "autoplay";
        newIframe.style.width = "100%";
        newIframe.style.height = "100%";
        newIframe.style.border = "none";
        newIframe.style.background = "white";
        newIframe.src = finalUrl;
        
        container.insertBefore(newIframe, container.firstChild);
        
        let userEmail = auth.currentUser ? auth.currentUser.email : "Vidyaplus User";
        document.getElementById('pdf-watermark-text').innerText = userEmail;
        
        const overlay = document.getElementById('pdf-mode');
        if (!overlay.classList.contains('active')) {
            window.history.pushState({ pdfOpen: true }, '', window.location.href);
            overlay.classList.add('active');
        }
    },

    closePDF: () => {
        const overlay = document.getElementById('pdf-mode');
        if (overlay.classList.contains('active')) {
            overlay.classList.remove('active');
            let iframe = document.getElementById('pdf-iframe');
            if (iframe) iframe.remove(); // 🚨 DESTROY IFRAME
            window.history.back(); 
        }
    },

    togglePDFFull: () => {
        let elem = document.getElementById('pdf-viewer-container');
        if (!document.fullscreenElement) elem.requestFullscreen();
        else document.exitFullscreen();
    }
};
