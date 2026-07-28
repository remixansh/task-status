// ============================================
// State
// ============================================
let currentView = 'dashboard';
let tasks = [];
let summaries = [];
let editingTaskId = null;
let calYear, calMonth, selectedDate;

// Initialize calendar to today
const today = new Date();
calYear = today.getFullYear();
calMonth = today.getMonth();
selectedDate = formatDateKey(today);

// ============================================
// Utilities
// ============================================
function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function timeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const s = Math.round((now - date) / 1000);
    if (s < 60) return 'Just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d === 1) return 'Yesterday';
    return `${d}d ago`;
}

function formatDateKey(d) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
}

function formatTime24(dateString) {
    if (!dateString) return '??:??';
    const d = new Date(dateString);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDateFull(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
}

function getStatusClass(status) {
    if (!status) return 'status-pending';
    switch (status.toLowerCase()) {
        case 'in progress': return 'status-in-progress';
        case 'done': return 'status-done';
        default: return 'status-pending';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 2500);
}

function getTaskDateKey(task) {
    const ts = task.timestamp || task.created_at;
    if (!ts) return null;
    return formatDateKey(new Date(ts));
}

// ============================================
// API
// ============================================
async function fetchTasks() {
    try {
        const res = await fetch('/api/tasks');
        if (!res.ok) throw new Error('Failed');
        tasks = await res.json();
        if (tasks.tasks) tasks = tasks.tasks;
        renderAll();
    } catch (e) {
        console.error('Fetch tasks:', e);
        showToast('Could not load tasks', 'error');
    }
}

async function createTask(data) {
    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Task added', 'success');
        fetchTasks();
    } catch (e) {
        showToast('Could not add task', 'error');
    }
}

async function updateTask(id, data) {
    try {
        const res = await fetch(`/api/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Task updated', 'success');
        fetchTasks();
    } catch (e) {
        showToast('Could not update task', 'error');
    }
}

async function deleteTask(id) {
    try {
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        showToast('Task deleted', 'success');
        fetchTasks();
    } catch (e) {
        showToast('Could not delete task', 'error');
    }
}

async function fetchComments(taskId) {
    try {
        const res = await fetch(`/api/tasks/${taskId}/comments`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        return data.comments || data || [];
    } catch (e) {
        showToast('Could not load comments', 'error');
        return [];
    }
}

async function fetchSummaries() {
    try {
        const res = await fetch('/api/summaries');
        if (!res.ok) throw new Error('Failed');
        summaries = await res.json();
        renderSummaries();
    } catch (e) {
        console.error('Fetch summaries:', e);
    }
}

async function addComment(taskId, data) {
    try {
        const res = await fetch(`/api/tasks/${taskId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Comment added', 'success');
        const comments = await fetchComments(taskId);
        renderComments(comments);
    } catch (e) {
        showToast('Could not add comment', 'error');
    }
}

async function generateSummary() {
    try {
        showToast('Generating summary...', 'info');
        const res = await fetch('/api/generate-summary', { method: 'POST' });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        
        showToast(data.message || 'Summary generation completed', 'success');
        fetchTasks();
        fetchSummaries(); // Refresh summaries
        
        // Open notification panel to show it
        if (data.summary) {
            document.getElementById('notif-panel').classList.add('open');
            document.getElementById('notif-backdrop').classList.add('open');
        }
    } catch (e) {
        showToast('Could not generate summary', 'error');
    }
}

// ============================================
// Calendar
// ============================================
function renderCalendar() {
    const monthNames = ['January','February','March','April','May','June',
        'July','August','September','October','November','December'];
    document.getElementById('cal-month-year').textContent = `${monthNames[calMonth]} ${calYear}`;

    const container = document.getElementById('cal-days');
    container.innerHTML = '';

    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    // Monday-based: 0=Mon ... 6=Sun
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const todayKey = formatDateKey(new Date());

    // Collect date keys that have tasks
    const taskDates = new Set();
    tasks.forEach(t => {
        const k = getTaskDateKey(t);
        if (k) taskDates.add(k);
    });

    // Previous month padding
    const prevLast = new Date(calYear, calMonth, 0);
    for (let i = startDow - 1; i >= 0; i--) {
        const d = prevLast.getDate() - i;
        const el = document.createElement('div');
        el.className = 'cal-day other-month';
        el.textContent = d;
        container.appendChild(el);
    }

    // Current month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateObj = new Date(calYear, calMonth, d);
        const key = formatDateKey(dateObj);
        const el = document.createElement('div');
        el.className = 'cal-day';
        el.textContent = d;
        if (key === todayKey) el.classList.add('today');
        if (key === selectedDate) el.classList.add('selected');
        if (taskDates.has(key)) el.classList.add('has-tasks');
        el.addEventListener('click', () => {
            selectedDate = key;
            renderCalendar();
            renderDashboard();
        });
        container.appendChild(el);
    }

    // Next month padding
    const totalCells = startDow + lastDay.getDate();
    const remainder = totalCells % 7;
    if (remainder > 0) {
        for (let d = 1; d <= 7 - remainder; d++) {
            const el = document.createElement('div');
            el.className = 'cal-day other-month';
            el.textContent = d;
            container.appendChild(el);
        }
    }
}

// ============================================
// Dashboard Rendering
// ============================================
function renderDashboard() {
    const grid = document.getElementById('task-grid');
    grid.innerHTML = '';

    // Filter tasks by selected date
    const filtered = tasks.filter(t => getTaskDateKey(t) === selectedDate);

    // Update header
    const dateTitle = document.getElementById('selected-date-title');
    const todayKey = formatDateKey(new Date());
    if (selectedDate === todayKey) {
        dateTitle.textContent = 'Today';
    } else {
        const parts = selectedDate.split('-');
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        dateTitle.textContent = d.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric'
        });
    }

    // Task count badge
    document.getElementById('tasks-count').textContent =
        filtered.length === 0 ? 'No tasks' : `${filtered.length} task${filtered.length !== 1 ? 's' : ''}`;

    // Stats
    document.getElementById('stat-total').textContent = tasks.length;
    document.getElementById('stat-progress').textContent =
        tasks.filter(t => t.status === 'In Progress').length;
    document.getElementById('stat-done').textContent =
        tasks.filter(t => t.status === 'Done').length;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 12 2 2 4-4"/></svg>
                <p>No tasks for this day</p>
            </div>`;
        return;
    }

    filtered.forEach((task, i) => {
        const isSummary = task.is_summary;
        const card = document.createElement('div');
        card.className = `task-card${isSummary ? ' summary-card' : ''}`;
        card.style.animationDelay = `${i * 0.04}s`;
        card.innerHTML = `
            <div class="task-card-header">
                <span class="task-title">${isSummary ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></svg> ' : ''}${escapeHtml(task.title)}</span>
                <div class="task-card-actions">
                    <button class="btn-icon btn-edit" data-id="${task.id}" title="Edit">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button class="btn-icon danger btn-delete" data-id="${task.id}" title="Delete">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
            <div class="task-context">${escapeHtml(task.context)}</div>
            <div class="task-card-footer">
                <span class="status-badge ${getStatusClass(task.status)}">${escapeHtml(task.status)}</span>
                <span class="task-time">${timeAgo(task.timestamp)}</span>
            </div>`;
        grid.appendChild(card);
    });
}

// ============================================
// Terminal / Log Rendering
// ============================================
function renderLog() {
    const body = document.getElementById('terminal-body');
    body.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        body.innerHTML = `
            <div class="log-line"><span class="log-type pending">SYSTEM</span><span class="log-msg">No task logs found. Create a task to begin.</span></div>
            <div class="log-prompt"><span>$ </span><span class="cursor"></span></div>`;
        return;
    }

    // Sort oldest first (chronological like a real log)
    const sorted = [...tasks].sort((a, b) =>
        new Date(a.timestamp || a.created_at) - new Date(b.timestamp || b.created_at)
    );

    // Group by date
    const groups = {};
    sorted.forEach(t => {
        const key = getTaskDateKey(t) || 'Unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
    });

    let html = '';
    // Boot message
    html += `<div class="log-line"><span class="log-time">--:--</span><span class="log-type" style="color:var(--term-cyan)">BOOT</span><span class="log-msg">TaskStatus v1.0 initialized. Scheduler active @ 18:00 IST.</span></div>`;
    html += `<hr class="log-separator">`;

    Object.keys(groups).sort().forEach(dateKey => {
        const items = groups[dateKey];
        const d = new Date(dateKey + 'T00:00:00');
        const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        html += `<div class="log-date-header">── ${dateLabel} ──</div>`;

        items.forEach(task => {
            const time = formatTime24(task.timestamp);
            const isSummary = task.is_summary;
            let typeClass, typeLabel;

            if (isSummary) {
                typeClass = 'summary'; typeLabel = 'SUMMARY';
            } else {
                switch ((task.status || '').toLowerCase()) {
                    case 'in progress': typeClass = 'progress'; typeLabel = 'WORKING'; break;
                    case 'done': typeClass = 'done'; typeLabel = 'DONE'; break;
                    default: typeClass = 'pending'; typeLabel = 'PENDING'; break;
                }
            }

            const title = escapeHtml(task.title);
            const ctx = task.context ? ` <span class="highlight">// ${escapeHtml(task.context.substring(0, 80))}${task.context.length > 80 ? '...' : ''}</span>` : '';
            html += `<div class="log-line"><span class="log-time">[${time}]</span><span class="log-type ${typeClass}">${typeLabel}</span><span class="log-msg">"${title}"${ctx}</span></div>`;
        });
    });

    html += `<hr class="log-separator">`;
    html += `<div class="log-prompt"><span>$ </span><span class="cursor"></span></div>`;

    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
}

// ============================================
// Comments
// ============================================
function renderComments(comments, listElementId = 'comments-list') {
    const list = document.getElementById(listElementId);
    if (!list) return;
    list.innerHTML = '';
    if (!comments || comments.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:0.75rem 0; font-size:0.8rem;">No comments yet.</div>';
        return;
    }
    comments.forEach(c => {
        const item = document.createElement('div');
        item.className = 'comment-item';
        item.innerHTML = `
            <div class="comment-header">
                <span class="comment-name">${escapeHtml(c.name)}</span>
                <span class="comment-time">${timeAgo(c.timestamp)}</span>
            </div>
            <div class="comment-text">${escapeHtml(c.comment || c.text)}</div>`;
        list.appendChild(item);
    });
}

// ============================================
// Notification Panel (Summaries)
// ============================================
function renderSummaries() {
    const body = document.getElementById('notif-panel-body');
    const badge = document.getElementById('notif-badge');
    
    // Update badge
    if (summaries && summaries.length > 0) {
        badge.textContent = summaries.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    body.innerHTML = '';
    if (!summaries || summaries.length === 0) {
        body.innerHTML = '<div class="summary-empty">No summaries generated yet.</div>';
        return;
    }

    summaries.forEach(s => {
        const d = new Date(s.date + 'T00:00:00');
        const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        
        const card = document.createElement('div');
        card.className = 'summary-card-panel';
        
        let htmlContent = escapeHtml(s.content);
        try {
            if (typeof marked !== 'undefined') {
                htmlContent = marked.parse(s.content);
            }
        } catch(e){}

        card.innerHTML = `
            <div class="summary-date">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></svg>
                ${dateLabel}
            </div>
            <div class="summary-content markdown-body">${htmlContent}</div>
            <div class="summary-meta">${s.task_count} tasks &bull; Generated ${timeAgo(s.timestamp)}</div>
        `;
        body.appendChild(card);
    });
}

// ============================================
// Render All
// ============================================
function renderAll() {
    renderCalendar();
    if (currentView === 'dashboard') {
        renderDashboard();
    } else {
        renderLog();
    }
}

// ============================================
// Event Listeners
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    fetchTasks();
    fetchSummaries();

    // Notification Panel Toggle
    const btnNotif = document.getElementById('btn-notifications');
    const notifPanel = document.getElementById('notif-panel');
    const notifBackdrop = document.getElementById('notif-backdrop');
    const closeNotif = document.getElementById('notif-panel-close');

    const toggleNotifPanel = (show) => {
        if (show) {
            notifPanel.classList.add('open');
            notifBackdrop.classList.add('open');
            notifPanel.classList.remove('hidden');
            notifBackdrop.classList.remove('hidden');
        } else {
            notifPanel.classList.remove('open');
            notifBackdrop.classList.remove('open');
            // Allow animation to finish before hiding
            setTimeout(() => {
                if (!notifPanel.classList.contains('open')) {
                    notifPanel.classList.add('hidden');
                    notifBackdrop.classList.add('hidden');
                }
            }, 300);
        }
    };

    btnNotif.addEventListener('click', () => toggleNotifPanel(true));
    closeNotif.addEventListener('click', () => toggleNotifPanel(false));
    notifBackdrop.addEventListener('click', () => toggleNotifPanel(false));

    // View toggle
    const btnDash = document.getElementById('toggle-dashboard');
    const btnLog = document.getElementById('toggle-log');
    const viewDash = document.getElementById('dashboard-view');
    const viewLog = document.getElementById('log-view');

    btnDash.addEventListener('click', () => {
        currentView = 'dashboard';
        btnDash.classList.add('active');
        btnLog.classList.remove('active');
        viewDash.classList.add('active');
        viewLog.classList.remove('active');
        renderDashboard();
    });
    btnLog.addEventListener('click', () => {
        currentView = 'log';
        btnLog.classList.add('active');
        btnDash.classList.remove('active');
        viewLog.classList.add('active');
        viewDash.classList.remove('active');
        renderLog();
    });

    // Calendar nav
    document.getElementById('cal-prev').addEventListener('click', () => {
        calMonth--;
        if (calMonth < 0) { calMonth = 11; calYear--; }
        renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        calMonth++;
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCalendar();
    });

    // FAB — open add modal
    document.getElementById('fab-add-task').addEventListener('click', () => {
        document.getElementById('add-modal').classList.remove('hidden');
    });

    // Close add modal
    const closeAddModal = () => document.getElementById('add-modal').classList.add('hidden');
    document.getElementById('add-modal-close').addEventListener('click', closeAddModal);
    document.getElementById('add-modal').addEventListener('click', e => {
        if (e.target.id === 'add-modal') closeAddModal();
    });

    // Add task form
    document.getElementById('add-task-form').addEventListener('submit', e => {
        e.preventDefault();
        const title = document.getElementById('new-task-title');
        const context = document.getElementById('new-task-context');
        const status = document.getElementById('new-task-status');
        if (title.value.trim()) {
            createTask({
                title: title.value.trim(),
                context: context.value.trim(),
                status: status.value
            });
            title.value = ''; context.value = ''; status.value = 'Pending';
            closeAddModal();
        }
    });

    // Generate summary
    document.getElementById('btn-generate-summary').addEventListener('click', generateSummary);

    // Task grid delegation (edit / delete / view)
    document.getElementById('task-grid').addEventListener('click', async e => {
        const editBtn = e.target.closest('.btn-edit');
        const deleteBtn = e.target.closest('.btn-delete');
        const taskCard = e.target.closest('.task-card');

        if (editBtn) {
            e.stopPropagation();
            const id = editBtn.dataset.id;
            const task = tasks.find(t => String(t.id) === String(id));
            if (task) {
                editingTaskId = id;
                document.getElementById('edit-task-title').value = task.title;
                document.getElementById('edit-task-context').value = task.context || '';
                document.getElementById('edit-task-status').value = task.status || 'Pending';
                document.getElementById('edit-modal').classList.remove('hidden');
            }
            return;
        }
        
        if (deleteBtn) {
            e.stopPropagation();
            const id = deleteBtn.dataset.id;
            if (confirm('Delete this task?')) deleteTask(id);
            return;
        }

        // Clicked card itself (View Mode)
        if (taskCard) {
            const id = taskCard.querySelector('.btn-edit').dataset.id;
            const task = tasks.find(t => String(t.id) === String(id));
            if (task) {
                editingTaskId = id; // use this for comments
                
                document.getElementById('view-task-title').textContent = task.title;
                document.getElementById('view-task-status').className = `status-badge ${getStatusClass(task.status)}`;
                document.getElementById('view-task-status').textContent = task.status || 'Pending';
                document.getElementById('view-task-time').textContent = timeAgo(task.timestamp);
                
                const ctxEl = document.getElementById('view-task-context');
                if (task.is_summary && typeof marked !== 'undefined') {
                    ctxEl.innerHTML = marked.parse(task.context || '');
                } else {
                    ctxEl.textContent = task.context || ''; // use textContent for plain text to auto-escape
                    ctxEl.innerHTML = escapeHtml(task.context || '').replace(/\n/g, '<br>');
                }

                document.getElementById('view-comments-list').innerHTML = '<div style="color:var(--color-muted);font-size:0.8rem">Loading...</div>';
                document.getElementById('view-modal').classList.remove('hidden');
                
                const comments = await fetchComments(id);
                renderComments(comments, 'view-comments-list');
            }
        }
    });

    // Edit task form
    document.getElementById('edit-task-form').addEventListener('submit', e => {
        e.preventDefault();
        if (!editingTaskId) return;
        updateTask(editingTaskId, {
            title: document.getElementById('edit-task-title').value.trim(),
            context: document.getElementById('edit-task-context').value.trim(),
            status: document.getElementById('edit-task-status').value
        });
        document.getElementById('edit-modal').classList.add('hidden');
        editingTaskId = null;
    });

    // Add comment (from View modal)
    document.getElementById('view-add-comment-form').addEventListener('submit', e => {
        e.preventDefault();
        if (!editingTaskId) return;
        const name = document.getElementById('view-comment-name');
        const text = document.getElementById('view-comment-text');
        if (name.value.trim() && text.value.trim()) {
            addComment(editingTaskId, {
                name: name.value.trim(),
                comment: text.value.trim()
            }).then(() => {
                fetchComments(editingTaskId).then(comments => {
                    renderComments(comments, 'view-comments-list');
                });
            });
            text.value = '';
        }
    });

    // Close edit modal
    const closeEditModal = () => {
        document.getElementById('edit-modal').classList.add('hidden');
        if (document.getElementById('view-modal').classList.contains('hidden')) {
            editingTaskId = null; // only clear if view modal is also hidden
        }
    };
    document.getElementById('modal-close').addEventListener('click', closeEditModal);
    document.getElementById('edit-modal').addEventListener('click', e => {
        if (e.target.id === 'edit-modal') closeEditModal();
    });

    // Close view modal
    const closeViewModal = () => {
        document.getElementById('view-modal').classList.add('hidden');
        editingTaskId = null;
    };
    document.getElementById('view-modal-close').addEventListener('click', closeViewModal);
    document.getElementById('view-modal').addEventListener('click', e => {
        if (e.target.id === 'view-modal') closeViewModal();
    });
});
