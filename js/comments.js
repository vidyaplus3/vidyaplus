// js/comments.js
import { auth } from './firebase-init.js';

let lastCommentTime = 0;

export const CommentEngine = {
    currentPage: 1,
    hasMore: true,
    isLoading: false,
    currentLecture: null,
    
    replyState: { isReplying: false, parentId: null, userName: null },

    renderUI: (containerElement, lectureId) => {
        CommentEngine.currentPage = 1;
        CommentEngine.hasMore = true;
        CommentEngine.isLoading = false;
        CommentEngine.currentLecture = lectureId;
        CommentEngine.replyState = { isReplying: false, parentId: null, userName: null };

        containerElement.innerHTML = `
            <div class="chat-layout-wrapper" style="display:flex; flex-direction:column; height:100%; width:100%;">
                
                <div style="text-align:center; padding: 6px 0; background: #f8fafc; border-bottom: 1px solid #f1f5f9; font-size: 0.75rem; font-weight: 700; color: #64748b;">
                    Total Comments: <span id="comment-count" style="color:var(--primary);">Syncing...</span>
                </div>
                
                <div id="comments-container" style="flex:1; overflow-y:auto; padding: 12px 20px; scroll-behavior: smooth;">
                    <div id="loading-skeleton" class="comment-card" style="opacity:0.6; display:flex; gap:12px;">
                        <div class="skeleton" style="width:34px; height:34px; border-radius:50%; background:#e2e8f0;"></div>
                        <div class="comment-body" style="flex:1;">
                            <div class="skeleton" style="height:12px; width:100px; border-radius:4px; margin-bottom:8px; background:#e2e8f0;"></div>
                            <div class="skeleton" style="height:14px; width:80%; border-radius:4px; background:#e2e8f0;"></div>
                        </div>
                    </div>
                </div>
                
                <div class="comment-input-area" style="padding: 12px 20px; padding-bottom: calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #f1f5f9; background: #fff; flex-shrink: 0;">
                    <div id="reply-indicator" class="reply-indicator">
                        <span>Replying to <span id="reply-target-name" style="font-weight: 800;"></span></span>
                        <i class="fas fa-times-circle" id="cancel-reply-btn" style="cursor: pointer; font-size: 1rem;"></i>
                    </div>
                    
                    <div class="input-wrapper">
                        <input type="text" id="comment-input" placeholder="Type your query here..." autocomplete="off" maxlength="500">
                        <button id="send-comment-btn" class="send-btn" disabled><i class="fas fa-paper-plane" style="font-size: 0.85rem;"></i></button>
                    </div>
                </div>
            </div>
        `;

        setTimeout(() => {
            CommentEngine.initSecurity(lectureId);
            CommentEngine.fetchComments(false); 
            CommentEngine.setupInvertedScroll(); 
        }, 50);
    },

    generateCommentHTML: (comment, isReply = false) => {
        const userInit = comment.user_name.charAt(0).toUpperCase();
        const timeString = CommentEngine.timeAgo(comment.created_at);
        
        const marginStyle = isReply ? "margin-left: 2.5rem; margin-top: 8px; margin-bottom: 8px; padding-bottom: 0; border: none;" : "";
        const avatarStyle = isReply ? "width: 26px; height: 26px; font-size: 0.75rem;" : "";
        const likeColor = comment.is_liked_by_user ? 'var(--primary)' : '#64748b';
        
        let replyLogicHTML = '';
        
        if (!isReply) {
            const hasReplies = comment.replies && comment.replies.length > 0;
            replyLogicHTML = `
                <div class="reply-section">
                    ${hasReplies ? `<button class="toggle-replies-btn" data-id="${comment.id}" data-count="${comment.replies.length}"><i class="fas fa-chevron-down"></i> View ${comment.replies.length} Replies</button>` : ``}
                    <div id="replies-wrapper-${comment.id}" style="display: none; margin-top: 10px; border-left: 2px solid #f1f5f9; padding-left: 5px;">
                        <div id="replies-${comment.id}"></div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="comment-card" id="comment_${comment.id}" style="${marginStyle}">
                <div class="user-avatar" style="${avatarStyle}">${userInit}</div>
                <div class="comment-body">
                    <div class="comment-user">${comment.user_name} <span class="comment-time">${timeString}</span></div>
                    <div class="comment-text">${comment.text}</div>
                    
                    <div class="comment-actions">
                        <button class="action-btn-sm like-action-btn" data-id="${comment.id}" style="color: ${likeColor};">
                            <i class="fas fa-thumbs-up pointer-events-none"></i> <span class="like-count pointer-events-none">${comment.like_count || 0}</span>
                        </button>
                        
                        ${!isReply ? `
                        <button class="action-btn-sm trigger-reply-btn" data-id="${comment.id}" data-name="${comment.user_name}">
                            <i class="fas fa-reply pointer-events-none"></i> Reply
                        </button>` : ''}

                        <button class="action-btn-sm report-action-btn" data-id="${comment.id}" style="margin-left: auto;">
                            <i class="fas fa-flag pointer-events-none"></i>
                        </button>
                    </div>
                    ${replyLogicHTML}
                </div>
            </div>
        `;
    },

    fetchComments: async (isLoadMore = false) => {
        if (CommentEngine.isLoading || (!CommentEngine.hasMore && isLoadMore)) return;
        CommentEngine.isLoading = true;
        
        const container = document.getElementById('comments-container');
        const countSpan = document.getElementById('comment-count');
        const oldScrollHeight = container.scrollHeight;

        if (isLoadMore) container.insertAdjacentHTML('afterbegin', `<div id="scroll-spinner" style="text-align:center; padding:10px;"><i class="fas fa-circle-notch fa-spin text-blue-500"></i></div>`);

        try {
            const token = await auth.currentUser.getIdToken();
            const response = await fetch(`https://vidyaplus-backend.vercel.app/api/comments/${CommentEngine.currentLecture}?page=${CommentEngine.currentPage}&limit=20`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Fetch failed");
            
            const result = await response.json();
            
            if (!isLoadMore) container.innerHTML = ''; 
            else { const spinner = document.getElementById('scroll-spinner'); if (spinner) spinner.remove(); }

            if (result.comments.length === 0 && !isLoadMore) {
                container.innerHTML = `<div class="empty-box" style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#94a3b8;"><p style="font-weight:700; font-size: 0.95rem;">No queries yet. Be the first to ask!</p></div>`;
                countSpan.innerText = "0";
            } else {
                countSpan.innerText = `${result.totalCount || 0}`;
                
                const sortedComments = result.comments.reverse();
                let htmlToInsert = '';
                
                sortedComments.forEach(comment => {
                    htmlToInsert += CommentEngine.generateCommentHTML(comment, false);
                });

                if (isLoadMore) {
                    container.insertAdjacentHTML('afterbegin', htmlToInsert);
                    container.scrollTop = container.scrollHeight - oldScrollHeight;
                } else {
                    container.innerHTML = htmlToInsert;
                    sortedComments.forEach(comment => {
                        if (comment.replies && comment.replies.length > 0) {
                            const repliesBox = document.getElementById(`replies-${comment.id}`);
                            comment.replies.forEach(reply => {
                                repliesBox.insertAdjacentHTML('beforeend', CommentEngine.generateCommentHTML(reply, true));
                            });
                        }
                    });
                    container.scrollTop = container.scrollHeight;
                }

                if (isLoadMore) {
                     sortedComments.forEach(comment => {
                        if (comment.replies && comment.replies.length > 0) {
                            const repliesBox = document.getElementById(`replies-${comment.id}`);
                            comment.replies.forEach(reply => {
                                repliesBox.insertAdjacentHTML('beforeend', CommentEngine.generateCommentHTML(reply, true));
                            });
                        }
                    });
                }

                CommentEngine.hasMore = result.hasMore;
                if (CommentEngine.hasMore) CommentEngine.currentPage++;
            }
        } catch (error) {
            if (!isLoadMore) container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-weight:600;">System Offline.</div>`;
        } finally {
            CommentEngine.isLoading = false;
        }
    },

    setupInvertedScroll: () => {
        const container = document.getElementById('comments-container'); 
        if (!container) return;
        container.addEventListener('scroll', () => {
            if (container.scrollTop === 0 && CommentEngine.hasMore && !CommentEngine.isLoading) {
                CommentEngine.fetchComments(true);
            }
        });
    },

    enableReplyMode: (parentId, userName) => {
        CommentEngine.replyState = { isReplying: true, parentId, userName };
        document.getElementById('reply-target-name').innerText = userName;
        document.getElementById('reply-indicator').classList.add('active');
        const input = document.getElementById('comment-input');
        input.placeholder = "Write a reply...";
        input.focus();
    },

    disableReplyMode: () => {
        CommentEngine.replyState = { isReplying: false, parentId: null, userName: null };
        document.getElementById('reply-indicator').classList.remove('active');
        const input = document.getElementById('comment-input');
        input.placeholder = "Type your query here...";
        input.value = '';
        document.getElementById('send-comment-btn').disabled = true;
    },

    initSecurity: (lectureId) => {
        const input = document.getElementById('comment-input');
        const btn = document.getElementById('send-comment-btn');
        const container = document.getElementById('comments-container');

        input.addEventListener('input', (e) => { btn.disabled = e.target.value.trim().length === 0; });
        document.getElementById('cancel-reply-btn').addEventListener('click', () => { CommentEngine.disableReplyMode(); });

        btn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (text.length === 0) return; 
            const now = Date.now();
            if (now - lastCommentTime < 3000) return; 
            
            const isReply = CommentEngine.replyState.isReplying;
            const targetParentId = isReply ? CommentEngine.replyState.parentId : null;
            
            const tempId = CommentEngine.postOptimistic(text, targetParentId);
            lastCommentTime = now;
            const savedText = input.value;
            
            CommentEngine.disableReplyMode();
            if (!isReply) container.scrollTop = container.scrollHeight;

            try {
                const token = await auth.currentUser.getIdToken();
                const response = await fetch('https://vidyaplus-backend.vercel.app/api/comments', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lectureId: lectureId, text: text, parentId: targetParentId })
                });
                if (!response.ok) throw new Error("Failed");
                const resultData = await response.json();

                const card = document.getElementById(`comment_${tempId}`);
                if (card) {
                    card.id = `comment_${resultData.id}`;
                    card.classList.remove('optimistic');
                    card.querySelector('.comment-time').innerText = "Just now";
                    card.querySelectorAll('[data-id]').forEach(el => el.setAttribute('data-id', resultData.id));
                    if(!isReply) {
                        card.querySelector(`#replies-wrapper-${tempId}`).id = `replies-wrapper-${resultData.id}`;
                        card.querySelector(`#replies-${tempId}`).id = `replies-${resultData.id}`;
                    }
                }
            } catch (error) {
                const failedComment = document.getElementById(`comment_${tempId}`);
                if(failedComment) failedComment.remove();
                input.value = savedText; btn.disabled = false;
            }
        });

        container.addEventListener('click', async (e) => {
            const clickedBody = e.target.closest('.comment-card');
            const clickedToggleButton = e.target.closest('.toggle-replies-btn');
            
            if ((clickedBody || clickedToggleButton) && !e.target.closest('.action-btn-sm')) {
                let id = clickedToggleButton ? clickedToggleButton.getAttribute('data-id') : (clickedBody && !clickedBody.style.marginLeft ? clickedBody.id.replace('comment_', '') : null);
                if (id) {
                    const wrapper = document.getElementById(`replies-wrapper-${id}`);
                    const toggleBtn = document.querySelector(`.toggle-replies-btn[data-id="${id}"]`);
                    if (wrapper) {
                        if (wrapper.style.display === 'none' || wrapper.style.display === '') {
                            wrapper.style.display = 'block';
                            if(toggleBtn) toggleBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Hide Replies`;
                        } else {
                            wrapper.style.display = 'none';
                            const count = toggleBtn ? toggleBtn.getAttribute('data-count') : 0;
                            if(toggleBtn) toggleBtn.innerHTML = `<i class="fas fa-chevron-down"></i> View ${count} Replies`;
                        }
                    }
                }
            }

            const triggerReplyBtn = e.target.closest('.trigger-reply-btn');
            if (triggerReplyBtn) {
                const parentId = triggerReplyBtn.getAttribute('data-id');
                const parentName = triggerReplyBtn.getAttribute('data-name');
                const wrapper = document.getElementById(`replies-wrapper-${parentId}`);
                const toggleBtn = document.querySelector(`.toggle-replies-btn[data-id="${parentId}"]`);
                if (wrapper && wrapper.style.display === 'none') {
                    wrapper.style.display = 'block';
                    if(toggleBtn) toggleBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Hide Replies`;
                }
                CommentEngine.enableReplyMode(parentId, parentName);
                return;
            }

            const likeBtn = e.target.closest('.like-action-btn');
            if (likeBtn) {
                const id = likeBtn.getAttribute('data-id');
                const countSpan = likeBtn.querySelector('.like-count');
                let count = parseInt(countSpan.innerText) || 0;
                const isLiked = likeBtn.style.color === 'var(--primary)' || likeBtn.style.color === 'rgb(59, 130, 246)';
                if (isLiked) {
                    likeBtn.style.color = '#64748b'; countSpan.innerText = count > 0 ? count - 1 : 0;
                } else { likeBtn.style.color = 'var(--primary)'; countSpan.innerText = count + 1; }
                try {
                    const token = await auth.currentUser.getIdToken();
                    fetch('https://vidyaplus-backend.vercel.app/api/comments/like', {
                        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ commentId: id })
                    });
                } catch (err) {}
            }
        });
    },

    postOptimistic: (text, parentId = null) => {
        const userName = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Student";
        const tempId = "temp_" + Date.now();
        const fakeComment = { id: tempId, user_name: userName, created_at: new Date().toISOString(), text: text, like_count: 0, is_liked_by_user: false };
        const html = CommentEngine.generateCommentHTML(fakeComment, !!parentId);
        
        if (parentId) {
            const repliesBox = document.getElementById(`replies-${parentId}`);
            if(repliesBox) repliesBox.insertAdjacentHTML('beforeend', html);
        } else {
            const container = document.getElementById('comments-container');
            const emptyBox = container.querySelector('.empty-box');
            if (emptyBox) container.innerHTML = ''; 
            container.insertAdjacentHTML('beforeend', html);
        }
        
        const newCard = document.getElementById(`comment_${tempId}`);
        if(newCard) { newCard.classList.add('optimistic'); newCard.querySelector('.comment-time').innerText = "Sending..."; }
        return tempId; 
    },

    timeAgo: (dateString) => {
        const seconds = Math.round((new Date() - new Date(dateString)) / 1000);
        if (seconds < 60) return "Just now";
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.round(hours / 24)}d ago`;
    }
};
