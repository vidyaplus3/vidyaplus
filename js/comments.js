// js/comments.js
import { auth } from './firebase-init.js';

let lastCommentTime = 0;

export const CommentEngine = {
    currentPage: 1,
    hasMore: true,
    isLoading: false,
    currentLecture: null,

    // 1. UI Render (Chat Style Wrapper)
    renderUI: (containerElement, lectureId) => {
        CommentEngine.currentPage = 1;
        CommentEngine.hasMore = true;
        CommentEngine.isLoading = false;
        CommentEngine.currentLecture = lectureId;

        // 🚨 NAYA: Flex column layout jisme container scroll hoga aur input niche fix rahega
        containerElement.innerHTML = `
            <div class="chat-layout-wrapper">
                <div style="padding: 15px 20px 0; font-weight: 800; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
                    Live Discussion <span id="comment-count" style="font-size:0.75rem; color:var(--primary); font-weight:800; background:#E0E7FF; padding:4px 10px; border-radius:12px;">Syncing...</span>
                </div>
                
                <div id="comments-container">
                    <div id="loading-skeleton" class="comment-card" style="opacity:0.6;">
                        <div class="skeleton" style="width:36px; height:36px; border-radius:50%;"></div>
                        <div class="comment-body">
                            <div class="skeleton" style="height:12px; width:120px; border-radius:4px; margin-bottom:8px;"></div>
                            <div class="skeleton" style="height:14px; width:90%; border-radius:4px; margin-bottom:4px;"></div>
                        </div>
                    </div>
                </div>
                
                <div class="comment-input-area">
                    <div id="comment-error" style="color: #ef4444; font-size: 0.75rem; font-weight: 600; padding: 0 10px 8px; display: none;"></div>
                    <div style="display: flex; gap: 10px; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 30px; padding: 5px 5px 5px 18px;">
                        <input type="text" id="comment-input" placeholder="Type your query here..." autocomplete="off" maxlength="500">
                        <button id="send-comment-btn" class="send-btn" disabled><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>
        `;

        // Wait for DOM to paint, then initialize
        setTimeout(() => {
            CommentEngine.initSecurity(lectureId);
            CommentEngine.fetchComments(false); 
            CommentEngine.setupInvertedScroll(); 
        }, 50);
    },

    // 2. HTML Generator (Smart Replies Logic)
    generateCommentHTML: (comment, isReply = false) => {
        const userInit = comment.user_name.charAt(0).toUpperCase();
        const timeString = CommentEngine.timeAgo(comment.created_at);
        
        const marginStyle = isReply ? "margin-left: 3rem; margin-top: 10px; margin-bottom: 10px; padding-bottom: 0; border: none;" : "";
        const avatarStyle = isReply ? "width: 28px; height: 28px; font-size: 0.75rem;" : "";
        const likeColor = comment.is_liked_by_user ? 'var(--primary)' : '#94a3b8';
        
        let replyLogicHTML = '';
        
        if (!isReply) {
            const hasReplies = comment.replies && comment.replies.length > 0;
            
            replyLogicHTML = `
                <div class="reply-section" style="margin-top: 10px;">
                    ${hasReplies 
                        ? `<button class="reply-toggle-btn view-replies-btn" data-id="${comment.id}"><i class="fas fa-comments"></i> View ${comment.replies.length} Replies</button>` 
                        : `<button class="reply-toggle-btn direct-reply-btn" data-id="${comment.id}" style="background:transparent; color:#64748b; padding:0;"><i class="fas fa-reply"></i> Reply</button>`
                    }
                    
                    <div id="replies-wrapper-${comment.id}" style="display: none; margin-top: 15px; border-left: 2px solid #e2e8f0;">
                        <div id="replies-${comment.id}"></div>
                        
                        <div class="reply-input-wrapper" style="margin-left: 3rem;">
                            <input type="text" id="reply-input-${comment.id}" class="reply-input-field" placeholder="Add a reply...">
                            <button class="send-reply-btn" data-id="${comment.id}"><i class="fas fa-paper-plane" style="font-size:0.8rem;"></i></button>
                        </div>
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
                    
                    <div class="comment-actions" style="display: flex; gap: 20px; align-items: center; margin-top: 6px;">
                        <button class="like-action-btn" data-id="${comment.id}" style="font-size: 0.85rem; color: ${likeColor}; background: none; border: none; cursor: pointer; padding: 0; display:flex; align-items:center; gap: 5px;">
                            <i class="fas fa-thumbs-up pointer-events-none"></i> <span class="like-count pointer-events-none" style="font-weight:700;">${comment.like_count || 0}</span>
                        </button>
                        <button class="report-action-btn" data-id="${comment.id}" title="Report" style="font-size: 0.85rem; color: #cbd5e1; background: none; border: none; cursor: pointer; padding: 0; margin-left: auto;">
                            <i class="fas fa-flag pointer-events-none"></i>
                        </button>
                    </div>
                    
                    ${replyLogicHTML}
                </div>
            </div>
        `;
    },

    // 3. Fetch Data (INVERTED CHAT LOGIC)
    fetchComments: async (isLoadMore = false) => {
        if (CommentEngine.isLoading || (!CommentEngine.hasMore && isLoadMore)) return;
        CommentEngine.isLoading = true;
        
        const container = document.getElementById('comments-container');
        const countSpan = document.getElementById('comment-count');
        
        // Save current scroll height to prevent jumping when loading older messages at the top
        const oldScrollHeight = container.scrollHeight;

        if (isLoadMore) container.insertAdjacentHTML('afterbegin', `<div id="scroll-spinner" style="text-align:center; padding:10px;"><i class="fas fa-circle-notch fa-spin text-blue-500"></i></div>`);

        try {
            const token = await auth.currentUser.getIdToken();
            const response = await fetch(`https://vidyaplus-backend.vercel.app/api/comments/${CommentEngine.currentLecture}?page=${CommentEngine.currentPage}&limit=20`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Fetch failed");
            
            const result = await response.json();
            
            if (!isLoadMore) {
                container.innerHTML = ''; 
            } else {
                const spinner = document.getElementById('scroll-spinner');
                if (spinner) spinner.remove();
            }

            if (result.comments.length === 0 && !isLoadMore) {
                container.innerHTML = `<div class="empty-box" style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#94a3b8;"><i class="fas fa-comments" style="font-size:3rem; margin-bottom:15px; opacity:0.5;"></i><p style="font-weight:600;">No queries yet. Start the discussion!</p></div>`;
                countSpan.innerText = "0 Comments";
            } else {
                countSpan.innerText = `${result.totalCount || 0} Comment${result.totalCount > 1 ? 's' : ''}`;
                
                // 🚨 MAGICAL INVERT LOGIC: Backend se descending aate hain, hum inhe reverse karke DOM me dalte hain
                // Taki newest wala array ke last me ho.
                const sortedComments = result.comments.reverse();

                let htmlToInsert = '';
                sortedComments.forEach(comment => {
                    let commentHTML = CommentEngine.generateCommentHTML(comment, false);
                    htmlToInsert += commentHTML;
                });

                if (isLoadMore) {
                    // Purane messages upar dalne hain (Prepend)
                    container.insertAdjacentHTML('afterbegin', htmlToInsert);
                    // Scroll Fix: Taki scroll bar upar na bhage
                    const newScrollHeight = container.scrollHeight;
                    container.scrollTop = newScrollHeight - oldScrollHeight;
                } else {
                    // First load pe naye messages aayenge, unhe seedha dalo
                    container.innerHTML = htmlToInsert;
                    
                    // Saare replies dalna (Replies already oldest-first aate hain backend se)
                    sortedComments.forEach(comment => {
                        if (comment.replies && comment.replies.length > 0) {
                            const repliesBox = document.getElementById(`replies-${comment.id}`);
                            comment.replies.forEach(reply => {
                                repliesBox.insertAdjacentHTML('beforeend', CommentEngine.generateCommentHTML(reply, true));
                            });
                        }
                    });

                    // First time load pe seedha bottom me scroll kar do (WhatsApp style)
                    container.scrollTop = container.scrollHeight;
                }

                // Handle replies injection for prepended messages too
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
            console.error("Fetch Error:", error);
            if (!isLoadMore) container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-weight:600;">Failed to connect. Please refresh.</div>`;
        } finally {
            CommentEngine.isLoading = false;
        }
    },

    // 4. Inverted Scroll Setup
    setupInvertedScroll: () => {
        const container = document.getElementById('comments-container'); 
        if (!container) return;
        
        container.addEventListener('scroll', () => {
            // 🚨 NAYA LOGIC: Jab user UPAR scroll karta hai (Top pe pahuchta hai), tab purane comments load karo
            if (container.scrollTop === 0) {
                if (CommentEngine.hasMore && !CommentEngine.isLoading) {
                    CommentEngine.fetchComments(true);
                }
            }
        });
    },

    // 5. Logic & Interactive Clicks
    initSecurity: (lectureId) => {
        const input = document.getElementById('comment-input');
        const btn = document.getElementById('send-comment-btn');
        const container = document.getElementById('comments-container');

        // Input validation
        input.addEventListener('input', (e) => {
            btn.disabled = e.target.value.trim().length === 0;
        });

        // Send Main Comment
        btn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (text.length === 0) return; 

            const now = Date.now();
            if (now - lastCommentTime < 5000) return; // Anti-spam

            const tempId = CommentEngine.postOptimistic(text);
            lastCommentTime = now;
            const savedText = input.value;
            input.value = ''; btn.disabled = true;
            
            // Send user to bottom to see their new comment
            container.scrollTop = container.scrollHeight;

            try {
                const token = await auth.currentUser.getIdToken();
                const response = await fetch('https://vidyaplus-backend.vercel.app/api/comments', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lectureId: lectureId, text: text })
                });
                if (!response.ok) throw new Error("Backend failed");
                const resultData = await response.json();

                const card = document.getElementById(`comment_${tempId}`);
                if (card) {
                    card.id = `comment_${resultData.id}`;
                    card.classList.remove('optimistic');
                    card.querySelector('.comment-time').innerText = "Just now";
                    
                    // Update all dynamic data-ids
                    const els = card.querySelectorAll('[data-id]');
                    els.forEach(el => el.setAttribute('data-id', resultData.id));
                    
                    // Update IDs of inner wrappers
                    card.querySelector(`#replies-wrapper-${tempId}`).id = `replies-wrapper-${resultData.id}`;
                    card.querySelector(`#replies-${tempId}`).id = `replies-${resultData.id}`;
                    card.querySelector(`#reply-input-${tempId}`).id = `reply-input-${resultData.id}`;
                }
            } catch (error) {
                const failedComment = document.getElementById(`comment_${tempId}`);
                if(failedComment) failedComment.remove();
                input.value = savedText; btn.disabled = false;
            }
        });

        // Event Delegation for inside the container
        container.addEventListener('click', async (e) => {
            
            // SMART REPLY OPENER
            if (e.target.closest('.view-replies-btn') || e.target.closest('.direct-reply-btn')) {
                const btn = e.target.closest('.view-replies-btn') || e.target.closest('.direct-reply-btn');
                const id = btn.getAttribute('data-id');
                const wrapper = document.getElementById(`replies-wrapper-${id}`);
                
                if (wrapper.style.display === 'none' || wrapper.style.display === '') {
                    wrapper.style.display = 'block';
                    btn.style.display = 'none'; // Hide the button once opened
                }
            }

            // SEND REPLY
            const sendReplyBtn = e.target.closest('.send-reply-btn');
            if (sendReplyBtn) {
                const parentId = sendReplyBtn.getAttribute('data-id');
                const replyInput = document.getElementById(`reply-input-${parentId}`);
                const text = replyInput.value.trim();
                
                if (text.length === 0) return;
                replyInput.value = '';

                const tempId = CommentEngine.postOptimistic(text, parentId);

                try {
                    const token = await auth.currentUser.getIdToken();
                    const response = await fetch('https://vidyaplus-backend.vercel.app/api/comments', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lectureId: lectureId, text: text, parentId: parentId })
                    });
                    if (!response.ok) throw new Error("Reply failed");
                    const resultData = await response.json();

                    const replyCard = document.getElementById(`comment_${tempId}`);
                    if (replyCard) {
                        replyCard.id = `comment_${resultData.id}`;
                        replyCard.classList.remove('optimistic');
                        replyCard.querySelector('.comment-time').innerText = "Just now";
                        replyCard.querySelector('.like-action-btn').setAttribute('data-id', resultData.id);
                        replyCard.querySelector('.report-action-btn').setAttribute('data-id', resultData.id);
                    }
                } catch (error) {
                    const failedReply = document.getElementById(`comment_${tempId}`);
                    if(failedReply) failedReply.remove();
                    replyInput.value = text;
                }
            }

            // LIKES & REPORT remain same as before
            const likeBtn = e.target.closest('.like-action-btn');
            if (likeBtn) {
                const id = likeBtn.getAttribute('data-id');
                const countSpan = likeBtn.querySelector('.like-count');
                let count = parseInt(countSpan.innerText) || 0;
                
                const isLiked = likeBtn.style.color === 'var(--primary)' || likeBtn.style.color === 'rgb(79, 70, 229)';
                if (isLiked) {
                    likeBtn.style.color = '#94a3b8';
                    countSpan.innerText = count > 0 ? count - 1 : 0;
                } else {
                    likeBtn.style.color = 'var(--primary)';
                    countSpan.innerText = count + 1;
                }

                try {
                    const token = await auth.currentUser.getIdToken();
                    fetch('https://vidyaplus-backend.vercel.app/api/comments/like', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ commentId: id })
                    });
                } catch (err) { /* silent fail for UX */ }
            }
        });
    },

    // 6. Zero-Lag Optimistic Render (Appends to Bottom Now)
    postOptimistic: (text, parentId = null) => {
        const userName = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Student";
        const tempId = "temp_" + Date.now();
        
        const fakeComment = { id: tempId, user_name: userName, created_at: new Date().toISOString(), text: text, like_count: 0, is_liked_by_user: false };
        const html = CommentEngine.generateCommentHTML(fakeComment, !!parentId);
        
        if (parentId) {
            const repliesBox = document.getElementById(`replies-${parentId}`);
            repliesBox.insertAdjacentHTML('beforeend', html);
        } else {
            const container = document.getElementById('comments-container');
            const emptyBox = container.querySelector('.empty-box');
            if (emptyBox) container.innerHTML = ''; 
            // 🚨 NAYA: Kyunki naye messages bottom pe hain, hum use BeforeEnd lagayenge
            container.insertAdjacentHTML('beforeend', html);
        }
        
        document.getElementById(`comment_${tempId}`).classList.add('optimistic');
        document.querySelector(`#comment_${tempId} .comment-time`).innerText = "Sending...";
        
        return tempId; 
    },

    timeAgo: (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.round((now - date) / 1000);
        const minutes = Math.round(seconds / 60);
        const hours = Math.round(minutes / 60);
        const days = Math.round(hours / 24);

        if (seconds < 60) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }
};
