import { db } from '../../js/firebase-init.js';
import { collection, getDocs, addDoc, query, doc, deleteDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

window.loadedMaterialsCache = {};
window.editMaterialId = null;
window.batchesData = {}; 

window.openUploadPanel = () => {
    const batchId = document.getElementById('master-batch-select').value;
    if(!batchId) return window.showMsg("Validation Error: Please select a Target Batch first.");
    
    window.editMaterialId = null; 
    document.getElementById('form-heading').innerHTML = '<i class="fas fa-cloud-upload-alt" style="color:var(--primary);"></i> Upload New Material';
    document.getElementById('btn-save-content').innerText = "Publish Content to App 🚀";
    document.getElementById('upload-form').reset();
    document.getElementById('upload-panel').style.display = 'block';
    window.toggleFormFields();
};

window.closeUploadPanel = () => {
    document.getElementById('upload-panel').style.display = 'none';
    document.getElementById('upload-form').reset();
    window.editMaterialId = null;
};

window.toggleFormFields = () => {
    const targetArea = document.getElementById('inp-target-area').value;
    const type = document.getElementById('inp-type').value;
    const format = document.getElementById('inp-format').value;
    
    const groupSub = document.getElementById('group-subject');
    const groupChap = document.getElementById('group-chapter');
    const inpSub = document.getElementById('inp-subject');
    const inpChap = document.getElementById('inp-chapter');

    if(targetArea === 'batch_resource') {
        groupSub.style.display = 'none'; groupChap.style.display = 'none';
        inpSub.required = false; inpChap.required = false;
    } else if (targetArea === 'subject_material') {
        groupSub.style.display = 'block'; groupChap.style.display = 'none';
        inpSub.required = true; inpChap.required = false;
    } else {
        groupSub.style.display = 'block'; groupChap.style.display = 'block';
        inpSub.required = true; inpChap.required = true;
    }

    if(format === 'url') {
        document.getElementById('url-container').style.display = 'block';
        document.getElementById('file-container').style.display = 'none';
        document.getElementById('inp-url').required = true;
    } else {
        document.getElementById('url-container').style.display = 'none';
        document.getElementById('file-container').style.display = 'block';
        document.getElementById('inp-url').required = false;
    }

    if(type === 'lecture') {
        document.getElementById('attached-pdf-container').style.display = 'block';
        document.getElementById('thumb-container').style.display = 'block';
    } else {
        document.getElementById('attached-pdf-container').style.display = 'none';
        document.getElementById('thumb-container').style.display = 'none';
    }
};

window.fetchBatches = async () => {
    const batchSelect = document.getElementById('master-batch-select');
    const snap = await getDocs(collection(db, "batches"));
    batchSelect.innerHTML = '<option value="">-- Select Batch to Manage --</option>';
    snap.forEach(doc => { 
        const data = doc.data();
        window.batchesData[doc.id] = data; 
        batchSelect.innerHTML += `<option value="${doc.id}">${data.title}</option>`; 
    });
};

window.loadBatchData = async () => {
    const batchSelect = document.getElementById('master-batch-select');
    const contentContainer = document.getElementById('content-list-container');
    const batchId = batchSelect.value;
    
    if(!batchId) {
        contentContainer.innerHTML = '<div style="text-align:center; padding:4rem; color:var(--text-light);"><i class="fas fa-folder-open fa-3x" style="opacity:0.2;"></i><p>Select a target batch to view organized content hierarchy.</p></div>';
        window.closeUploadPanel();
        return;
    }

    const batchData = window.batchesData[batchId];
    const subjectSelect = document.getElementById('inp-subject');
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    
    if (batchData && batchData.subject) {
        const subjectsList = batchData.subject.split(',').map(s => s.trim()).filter(s => s !== "");
        subjectsList.forEach(sub => { subjectSelect.innerHTML += `<option value="${sub}">${sub}</option>`; });
    } else {
        subjectSelect.innerHTML += `<option value="General">General</option>`;
    }

    contentContainer.innerHTML = `<div style="text-align:center; padding:3rem;"><div class="spinner" style="margin:0 auto; border-left-color:var(--primary);"></div></div>`;
    try {
        const matRef = collection(db, "batches", batchId, "materials");
        const snap = await getDocs(query(matRef));
        
        if(snap.empty) {
            contentContainer.innerHTML = `<p style="text-align:center; padding:2rem; color:var(--text-light);">No content in this batch. Upload something to begin.</p>`;
            return;
        }

        window.loadedMaterialsCache = {}; 
        const tree = {};

        snap.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            window.loadedMaterialsCache[docSnap.id] = data; 
            
            let subject = data.subject ? data.subject.trim() : "Extra Material";
            let chapter = data.chapter || "General Notes";
            
            if(!tree[subject]) tree[subject] = {};
            if(!tree[subject][chapter]) tree[subject][chapter] = [];
            tree[subject][chapter].push(data);
        });

        renderContentTree(tree, contentContainer);

    } catch (err) { window.showMsg("Error loading content hierarchy"); console.error(err); }
};

function renderContentTree(tree, contentContainer) {
    contentContainer.innerHTML = '';
    let accIdCounter = 0;
    
    for (const [subject, chapters] of Object.entries(tree)) {
        let html = `
        <div class="tree-subject">
            <div class="tree-subject-header">
                <span>${subject}</span>
                <span style="font-size:0.8rem; background:rgba(99,102,241,0.1); padding:4px 10px; border-radius:12px;">${Object.keys(chapters).length} Chapters</span>
            </div>`;

        for (const [chapter, items] of Object.entries(chapters)) {
            accIdCounter++;
            let chapId = `chap-${accIdCounter}`;
            
            html += `
            <div class="tree-chapter">
                <div class="tree-chapter-header" onclick="toggleAccordion('${chapId}')">
                    <div class="tree-chapter-title">${chapter} <span style="font-size:0.7rem; color:#94a3b8; font-weight:600; margin-left:10px;">(${items.length} items)</span></div>
                    <i class="fas fa-chevron-down" id="icon-${chapId}" style="color:var(--text-light); transition:0.3s;"></i>
                </div>
                <div class="chapter-content-body" id="${chapId}">`;

            html += generateItemsHTML(items);
            html += `</div></div>`;
        }
        html += `</div>`;
        contentContainer.innerHTML += html;
    }
}

function generateItemsHTML(items) {
    let html = '';
    items.forEach(item => {
        let badgeClass = "type-vid"; let badgeText = "Video"; let icon = "fa-video";
        if(item.type === "pdf") { badgeClass = "type-pdf"; badgeText = "Document"; icon = "fa-file-pdf"; }
        if(item.type === "dpp") { badgeClass = "type-dpp"; badgeText = "DPP"; icon = "fa-tasks"; }
        if(item.type === "link") { badgeClass = "type-pdf"; badgeText = "Link"; icon = "fa-link"; }

        let attachBadge = item.attachedPdfUrl ? `<span class="badge-attached"><i class="fas fa-paperclip"></i> PDF Attached</span>` : "";
        
        let visualEl = '';
        if(item.type === 'lecture') {
            let thumbSrc = item.thumbnailUrl || 'https://images.unsplash.com/photo-1632516643738-4e892c5fc5e7';
            visualEl = `<img src="${thumbSrc}" class="mat-thumbnail">`;
        } else {
            visualEl = `<div style="width: 50px; height: 50px; border-radius: 8px; background: #f1f5f9; display: flex; justify-content: center; align-items: center; color: var(--text-light); font-size:1.2rem;"><i class="fas ${icon}"></i></div>`;
        }

        html += `
            <div class="content-row">
                <div style="display:flex; align-items:center; gap:15px;">
                    ${visualEl}
                    <div>
                        <h4 style="font-size: 1rem; color: var(--text); font-weight:700;">${item.title}</h4>
                        <div style="margin-top:5px; display:flex; align-items:center;">
                            <span class="type-badge ${badgeClass}">${badgeText}</span>
                            ${attachBadge}
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button class="icon-btn edit" onclick="triggerEditContent('${item.id}')" title="Edit Content"><i class="fas fa-pen"></i></button>
                    <button class="icon-btn delete" onclick="deleteContent('${item.id}')" title="Delete Content"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>`;
    });
    return html;
}
// Ensure the DOM is fully loaded before attaching the event listener
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const batchSelect = document.getElementById('master-batch-select');
        const batchId = batchSelect.value;
        if(!batchId) return window.showMsg("Validation Error: Batch selection required.");

        const format = document.getElementById('inp-format').value;
        if(format === 'file') return window.showMsg("Direct file uploads require Firebase Storage.");

        const submitBtn = document.getElementById('btn-save-content');
        submitBtn.innerText = "Processing...";
        submitBtn.disabled = true;
        
        const targetArea = document.getElementById('inp-target-area').value;
        const type = document.getElementById('inp-type').value;
        const url = document.getElementById('inp-url').value;

        const payload = {
            type: type,
            title: document.getElementById('inp-title').value,
            status: "Active",
            updatedAt: serverTimestamp()
        };

        if(targetArea === 'batch_resource') {
            payload.subject = "Batch Resources"; 
            payload.chapter = "General Files";
            payload.targetLayer = "global_resource";
        } else if (targetArea === 'subject_material') {
            payload.subject = document.getElementById('inp-subject').value;
            payload.chapter = "Subject Materials"; 
            payload.targetLayer = "subject_material";
        } else {
            payload.subject = document.getElementById('inp-subject').value;
            payload.chapter = document.getElementById('inp-chapter').value;
            payload.targetLayer = "chapter_content";
        }

        // 🚨 PRO FEATURE UPDATED HERE: Detects if HLS (.m3u8) or Standard Link
        if(type === 'lecture') {
            payload.videoUrl = url;
            payload.thumbnailUrl = document.getElementById('inp-thumb').value;
            payload.attachedPdfUrl = document.getElementById('inp-attached-pdf').value;
            
            // 🚨 Database me HLS Video ko alag se pehchanne ka flag
            if(url.includes('.m3u8')) {
                payload.isSecureHLS = true;
                payload.streamType = "Private HLS";
            } else {
                payload.isSecureHLS = false;
                payload.streamType = "Public YouTube";
            }
            
        } else if (type === 'pdf') {
            payload.pdfUrl = url;
        } else {
            payload.linkUrl = url;
        }

        try {
            if(window.editMaterialId) {
                await updateDoc(doc(db, "batches", batchId, "materials", window.editMaterialId), payload);
                window.showMsg("Content Updated Successfully!");
            } else {
                payload.createdAt = serverTimestamp();
                await addDoc(collection(db, "batches", batchId, "materials"), payload);
                window.showMsg("Content Published Successfully!");
            }
            window.closeUploadPanel();
            window.loadBatchData(); 
        } catch (err) { window.showMsg("Upload failed."); console.error(err); } 
        finally { 
            submitBtn.innerText = window.editMaterialId ? "Update Content" : "Publish Content to App 🚀"; 
            submitBtn.disabled = false;
        }
    });
});

window.triggerEditContent = (matId) => {
    const data = window.loadedMaterialsCache[matId];
    if(!data) return;

    window.editMaterialId = matId;
    document.getElementById('form-heading').innerHTML = '<i class="fas fa-pen"></i> Edit Material';
    
    if(data.targetLayer) {
        document.getElementById('inp-target-area').value = data.targetLayer;
    } else if (data.subject === "Batch Resources") {
        document.getElementById('inp-target-area').value = "batch_resource";
    } else if (data.chapter === "Subject Materials") {
        document.getElementById('inp-target-area').value = "subject_material";
    } else {
        document.getElementById('inp-target-area').value = "chapter_content";
    }

    const targetSubject = data.subject !== "Batch Resources" ? (data.subject || "") : "";
    const subjectSelect = document.getElementById('inp-subject');
    
    let optionExists = Array.from(subjectSelect.options).some(opt => opt.value === targetSubject);
    if (!optionExists && targetSubject) {
        subjectSelect.innerHTML += `<option value="${targetSubject}">${targetSubject}</option>`;
    }
    subjectSelect.value = targetSubject;
        
    document.getElementById('inp-chapter').value = (data.chapter !== "Subject Materials" && data.chapter !== "General Files") ? (data.chapter || "") : "";
    document.getElementById('inp-type').value = data.type || "lecture";
    document.getElementById('inp-title').value = data.title || "";
    
    // 🚨 PRO FEATURE UPDATED HERE: Edit mode me link pre-fill karna
    if(data.type === 'lecture') {
        document.getElementById('inp-url').value = data.videoUrl || "";
        document.getElementById('inp-thumb').value = data.thumbnailUrl || "";
        document.getElementById('inp-attached-pdf').value = data.attachedPdfUrl || "";
        // Hint change for edit mode
        if(data.isSecureHLS) console.log("Editing a Secure HLS Stream.");
    } else if (data.type === 'pdf') {
        document.getElementById('inp-url').value = data.pdfUrl || "";
    } else {
        document.getElementById('inp-url').value = data.linkUrl || "";
    }

    document.getElementById('upload-panel').style.display = 'block';
    window.toggleFormFields();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteContent = async (matId) => {
    if(!confirm("Are you sure you want to permanently delete this resource?")) return;
    try {
        const batchSelect = document.getElementById('master-batch-select');
        await deleteDoc(doc(db, "batches", batchSelect.value, "materials", matId));
        window.showMsg("Resource Deleted.");
        window.loadBatchData();
    } catch (err) { window.showMsg("Deletion failed."); }
};
