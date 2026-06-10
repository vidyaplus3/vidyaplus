// js/classroom-boot.js
"use strict";

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { CommentEngine } from './comments.js';
import { PDFViewer } from './pdf.js';
import { VideoPlayer } from './player/index.js';

/**
 * PRODUCTION ARCHITECTURE OBJECT
 * Completely sealed to block modifications or prototype pollution runtime.
 */
const ClassroomOrchestrator = {
    state: {
        batchId: null,
        chapterName: null,
        lectureId: null,
        streamUrl: null,
        lectureTitle: null,
        attachedPdf: null,
        activeTab: 'comments'
    },

    listenersCache: [],

    /**
     * Initialization Core Endpoint
     */
    async init() {
        this.parseSecureContext();
        this.bindCoreDOMEvents();
        this.enforceStrictAcademicSecurity();
        
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                this.triggerFatalRedirection("Session expired or unauthorized execution context.");
                return;
            }
            this.provisionUserSecurityLayer(user);
            this.bootSubSystems();
        });
    },

    /**
     * Extracts variables securely from the execution environment URI parameters
     */
    parseSecureContext() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            this.state.batchId = urlParams.get('batchId');
            this.state.chapterName = urlParams.get('chapter');
            this.state.lectureId = urlParams.get('lectureId');
            this.state.streamUrl = urlParams.get('v'); // Securely encrypted streaming source pointer
            this.state.lectureTitle = urlParams.get('title') || "Academic Resource";
            this.state.attachedPdf = urlParams.get('pdf') || "";

            if (!this.state.batchId || !this.state.lectureId) {
                throw new Error("Missing structural payload dimensions.");
            }
        } catch (error) {
            console.error("[Fatal Security Context Failure]", error);
            this.triggerFatalRedirection("Invalid classroom invocation routing params.");
        }
    },

    /**
     * Binds Event Listeners cleanly through JS references without polluting HTML
     */
    bindCoreDOMEvents() {
        const closeBtn = document.getElementById('close-classroom-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.gracefulTeardownAndExit());
        }

        // Tab Navigation Event Delegation Architecture (High Performance)
        const tabsBar = document.getElementById('classroom-tabs-bar');
        if (tabsBar) {
            tabsBar.addEventListener('click', (event) => {
                const targetBtn = event.target.closest('.tab-navigation-link');
                if (!targetBtn) return;

                const targetContext = targetBtn.getAttribute('data-target');
                this.switchInteractionTab(targetContext, targetBtn);
            });
        }
    },

    /**
     * Prevents inspect element shortcuts and basic DOM level tampering safely
     */
    enforceStrictAcademicSecurity() {
        const preventDefaultAction = e => e.preventDefault();
        
        document.addEventListener('contextmenu', preventDefaultAction);
        document.addEventListener('copy', preventDefaultAction);
        document.addEventListener('cut', preventDefaultAction);
        document.addEventListener('paste', preventDefaultAction);

        // Security key code mitigation mapping block
        const trapKeyboardVulnerabilities = (e) => {
            if (e.key === 'F12' || 
               (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || 
               (e.ctrlKey && e.key === 'U')) {
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', trapKeyboardVulnerabilities);
        
        // Cache for teardown processing execution arrays
        this.listenersCache.push(
            { target: document, event: 'contextmenu', fn: preventDefaultAction },
            { target: document, event: 'copy', fn: preventDefaultAction },
            { target: document, event: 'cut', fn: preventDefaultAction },
            { target: document, event: 'paste', fn: preventDefaultAction },
            { target: document, event: 'keydown', fn: trapKeyboardVulnerabilities }
        );
    },

    /**
     * Watermarks client viewport instantly matching backend security contexts
     */
    provisionUserSecurityLayer(user) {
        const targetWatermarkNode = document.getElementById('secure-watermark-text');
        if (targetWatermarkNode) {
            targetWatermarkNode.textContent = `${user.email} | Secure Academic Node`;
        }
        
        const dynamicTitleNode = document.getElementById('classroom-dynamic-title');
        if (dynamicTitleNode) {
            dynamicTitleNode.textContent = this.state.lectureTitle;
        }

        const badgeNode = document.getElementById('classroom-subject-badge');
        if (badgeNode && this.state.chapterName) {
            badgeNode.textContent = this.state.chapterName.toUpperCase().replace(/_+/g, ' ');
        }
    },

    /**
     * Initializes playback engines and links analytics web workers dynamically
     */
    bootSubSystems() {
        if (this.state.streamUrl) {
            VideoPlayer.openVideo(this.state.streamUrl, this.state.lectureTitle, this.state.attachedPdf);
        }
        // Force sync first subsystem interface render view frame safely
        this.switchInteractionTab('comments', document.querySelector('[data-target="comments"]'));
    },

    /**
     * Safe tab routing rendering block. Prevents raw string HTML memory allocations.
     */
    switchInteractionTab(targetContext, buttonElement) {
        if (!targetContext || !buttonElement) return;

        // Clear active states down the navigation list node tree
        document.querySelectorAll('.tab-navigation-link').forEach(btn => btn.classList.remove('active'));
        buttonElement.classList.add('active');

        this.state.activeTab = targetContext;
        const targetViewport = document.getElementById('classroom-dynamic-viewport');
        if (!targetViewport) return;

        // Reset display container memory safely before switching frameworks execution scopes
        targetViewport.innerHTML = '';

        switch (targetContext) {
            case 'comments':
                const stableLectureId = `lec_${this.state.lectureId}`;
                CommentEngine.renderUI(targetViewport, stableLectureId);
                break;
                
            case 'notes':
                if (this.state.attachedPdf && this.state.attachedPdf !== 'undefined') {
                    PDFViewer.openSecureReaderInstance(targetViewport, this.state.attachedPdf, this.state.lectureTitle);
                } else {
                    this.renderEmptyStatePlaceholder(targetViewport, "fa-file-pdf", "No documentation artifacts pinned here.");
                }
                break;

            case 'practice':
                this.renderEmptyStatePlaceholder(targetViewport, "fa-tasks", "Practice sheets assignment parameters syncing shortly.");
                break;
        }
    },

    /**
     * Generates a completely secure placeholder item dynamically to prevent XSS.
     */
    renderEmptyStatePlaceholder(container, iconClass, descriptionString) {
        const outerBox = document.createElement('div');
        outerBox.className = 'empty-box';
        
        const iconNode = document.createElement('i');
        iconNode.className = `fas ${iconClass}`;
        
        const headingNode = document.createElement('h4');
        headingNode.textContent = descriptionString;

        outerBox.appendChild(iconNode);
        outerBox.appendChild(headingNode);
        container.appendChild(outerBox);
    },

    /**
     * Clears running processing systems out of execution heap layers prior context termination
     */
    gracefulTeardownAndExit() {
        console.log("[Classroom System Execution Teardown Implemented]");
        
        // Destroys processing video nodes completely preventing orphan threads
        if (VideoPlayer && typeof VideoPlayer.closeVideo === 'function') {
            VideoPlayer.closeVideo();
        }

        // Wipe running browser event tracking array references safely
        this.listenersCache.forEach(item => {
            item.target.removeEventListener(item.event, item.fn);
        });
        this.listenersCache = [];

        // Redirect back safely into structural context page layer boundaries
        window.location.replace(`/study#classroom`);
    },

    triggerFatalRedirection(reasonString) {
        alert(`Security Exception: ${reasonString}`);
        window.location.replace('explore.html');
    }
};

// Freeze the runtime reference boundary logic execution structure fully
Object.freeze(ClassroomOrchestrator);

// Trigger initiation loop cycle instantly on compilation frame load matching
document.addEventListener('DOMContentLoaded', () => {
    ClassroomOrchestrator.init();
});
      
