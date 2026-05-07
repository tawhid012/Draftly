/* =============================================
   DRAFTLY — app.js
   Real-time two-user private messaging system
   disguised as a personal notes/writing app.
   ============================================= */

// ─────────────────────────────────────────────
// 1. CONFIGURATION
// ─────────────────────────────────────────────

const SUPABASE_URL  = 'https://kcytzarvgcpzxgyyxqbk.supabase.co';       // ← Replace
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjeXR6YXJ2Z2NwenhneXl4cWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwODI5MjAsImV4cCI6MjA5MzY1ODkyMH0.XWFyzOhpLdYmd-0NK-YA1Ic0-_tHolwFFXI9stKC0W0';  // ← Replace

const ALLOWED_USERS = ['ig.tawhid@gmail.com', 'choudharyafreen842@gmail.com'];

const TYPING_DEBOUNCE_MS   = 1500;   // stop-typing grace period
const ACTIVE_HEARTBEAT_MS  = 12000;  // ping every 12 s
const ACTIVE_THRESHOLD_MS  = 20000;  // "online" if active within 20 s
const STATUS_POLL_MS        = 10000;  // poll other user's status

// ─────────────────────────────────────────────
// 2. SUPABASE CLIENT
// ─────────────────────────────────────────────

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─────────────────────────────────────────────
// 3. APP STATE
// ─────────────────────────────────────────────

let currentUser   = null;   // Supabase user object
let otherEmail    = null;   // the other allowed user's email
let typingTimer   = null;   // debounce handle for typing
let heartbeatTimer = null;  // interval for last_active pings
let statusPollTimer = null; // interval for other user status
let isTyping      = false;  // local typing state
let realtimeChan  = null;   // Supabase realtime channel
let allMessages   = [];     // cached messages array

// ─────────────────────────────────────────────
// 4. DOM REFERENCES
// ─────────────────────────────────────────────

const $ = id => document.getElementById(id);

const UI = {
  loginScreen:      $('login-screen'),
  restrictedScreen: $('restricted-screen'),
  app:              $('app'),

  loginForm:        $('login-form'),
  loginEmail:       $('login-email'),
  loginPassword:    $('login-password'),
  loginError:       $('login-error'),
  loginBtn:         $('login-btn'),
  loginBtnText:     $('login-btn-text'),
  loginSpinner:     $('login-spinner'),

  restrictedBackBtn: $('restricted-back-btn'),

  navEmail:         $('nav-email'),
  navStatus:        $('nav-status'),
  logoutBtn:        $('logout-btn'),

  sidebar:          $('sidebar'),
  sidebarToggle:    $('sidebar-toggle'),
  sidebarOverlay:   $('sidebar-overlay'),

  messagesFeed:     $('messages-feed'),
  feedEmpty:        $('feed-empty'),
  typingIndicator:  $('typing-indicator'),

  messageInput:     $('message-input'),
  sendBtn:          $('send-btn'),

  otherUserDot:     $('other-user-dot'),
  otherUserLabel:   $('other-user-label'),

  // New views
  navTitleEl:       $('nav-title'),
  dashboardView:    $('dashboard-view'),
  draftsView:       $('drafts-view'),
  tasksView:        $('tasks-view'),
  notesView:        $('notes-view'),

  // Dashboard stats
  statTotalTasks:   $('stat-total-tasks'),
  statDoneTasks:    $('stat-done-tasks'),
  statNotesCount:   $('stat-notes-count'),
  statDraftsCount:  $('stat-drafts-count'),

  // Dashboard previews
  dashTasksPreview: $('dash-tasks-preview'),
  dashNotesPreview: $('dash-notes-preview'),
  dashGotoTasks:    $('dash-goto-tasks'),
  dashGotoNotes:    $('dash-goto-notes'),

  // Study timer
  timerDisplay:     $('timer-display'),
  timerStart:       $('timer-start'),
  timerPause:       $('timer-pause'),
  timerReset:       $('timer-reset'),

  // Tasks
  taskInput:        $('task-input'),
  taskAddBtn:       $('task-add-btn'),
  tasksList:        $('tasks-list'),
  tasksEmpty:       $('tasks-empty'),

  // Notes
  noteInput:        $('note-input'),
  noteAddBtn:       $('note-add-btn'),
  notesList:        $('notes-list'),
  notesEmpty:       $('notes-empty'),
};

// ─────────────────────────────────────────────
// 5. SCREEN SWITCHER
// ─────────────────────────────────────────────

function showScreen(screen) {
  UI.loginScreen.classList.add('hidden');
  UI.restrictedScreen.classList.add('hidden');
  UI.app.classList.add('hidden');
  screen.classList.remove('hidden');
}

// ─────────────────────────────────────────────
// 6. LOGIN / LOGOUT
// ─────────────────────────────────────────────

UI.loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email    = UI.loginEmail.value.trim().toLowerCase();
  const password = UI.loginPassword.value;

  setLoginLoading(true);
  UI.loginError.classList.add('hidden');

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (!ALLOWED_USERS.includes(email)) {
      await sb.auth.signOut();
      showScreen(UI.restrictedScreen);
      return;
    }

    await initApp(data.user);
  } catch (err) {
    showLoginError(err.message || 'Login failed. Please try again.');
  } finally {
    setLoginLoading(false);
  }
});

UI.restrictedBackBtn.addEventListener('click', () => {
  showScreen(UI.loginScreen);
  UI.loginPassword.value = '';
  UI.loginError.classList.add('hidden');
});

UI.logoutBtn.addEventListener('click', async () => {
  await cleanup();
  await sb.auth.signOut();
  currentUser = null;
  otherEmail  = null;
  showScreen(UI.loginScreen);
  UI.loginPassword.value = '';
});

function setLoginLoading(loading) {
  UI.loginBtn.disabled = loading;
  UI.loginBtnText.textContent = loading ? 'Signing in…' : 'Sign In';
  UI.loginSpinner.classList.toggle('hidden', !loading);
}

function showLoginError(msg) {
  UI.loginError.textContent = msg;
  UI.loginError.classList.remove('hidden');
}

// ─────────────────────────────────────────────
// 7. SESSION RESTORE
// ─────────────────────────────────────────────

async function restoreSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showScreen(UI.loginScreen); return; }

  const email = session.user.email.toLowerCase();
  if (!ALLOWED_USERS.includes(email)) {
    await sb.auth.signOut();
    showScreen(UI.loginScreen);
    return;
  }

  await initApp(session.user);
}

// ─────────────────────────────────────────────
// 8. APP INIT
// ─────────────────────────────────────────────

async function initApp(user) {
  currentUser = user;
  const email = user.email.toLowerCase();

  otherEmail = ALLOWED_USERS.find(u => u !== email) || null;

  // Update navbar
  UI.navEmail.textContent = email;
  UI.navStatus.textContent = 'Online';
  UI.navStatus.className = 'status-badge status-online';

  showScreen(UI.app);

  // Upsert user row (ensure exists)
  await upsertUserRow(email);

  // Navigate to Dashboard by default
  navigateTo('dashboard');

  // Load messages (for drafts)
  await loadMessages();

  // Subscribe to realtime
  subscribeRealtime();

  // Mark messages as seen
  await markMessagesSeen();

  // Start heartbeat
  startHeartbeat(email);

  // Start polling other user's status
  startStatusPoll();

  // Load tasks & notes
  await loadTasks();
  await loadNotes();

  // Init study timer
  initTimer();
}

// ─────────────────────────────────────────────
// 9. DATABASE HELPERS
// ─────────────────────────────────────────────

async function upsertUserRow(email) {
  const { error } = await sb.from('users').upsert(
    { email, last_active: new Date().toISOString() },
    { onConflict: 'email' }
  );
  if (error) console.warn('upsertUserRow:', error.message);
}

async function updateLastActive(email) {
  const { error } = await sb.from('users')
    .update({ last_active: new Date().toISOString() })
    .eq('email', email);
  if (error) console.warn('updateLastActive:', error.message);
}

async function loadMessages() {
  const { data, error } = await sb.from('messages')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) { console.error('loadMessages:', error.message); return; }

  allMessages = data || [];
  renderMessages();
}

async function sendMessage(content) {
  if (!content.trim()) return;

  const { error } = await sb.from('messages').insert({
    content: content.trim(),
    sender:  currentUser.email.toLowerCase(),
    seen:    false,
  });

  if (error) console.error('sendMessage:', error.message);
}

async function markMessagesSeen() {
  if (!otherEmail) return;
  // Mark all messages from the other user as seen
  const { error } = await sb.from('messages')
    .update({ seen: true })
    .eq('sender', otherEmail)
    .eq('seen', false);

  if (error) console.warn('markMessagesSeen:', error.message);
}

// ─────────────────────────────────────────────
// 10. TYPING STATUS
// ─────────────────────────────────────────────

async function setTyping(typing) {
  if (isTyping === typing) return;
  isTyping = typing;

  const email = currentUser.email.toLowerCase();

  const { error } = await sb.from('typing_status').upsert(
    { user_email: email, is_typing: typing },
    { onConflict: 'user_email' }
  );
  if (error) console.warn('setTyping:', error.message);
}

// ─────────────────────────────────────────────
// 11. REALTIME SUBSCRIPTIONS
// ─────────────────────────────────────────────

function subscribeRealtime() {
  if (realtimeChan) sb.removeChannel(realtimeChan);

  realtimeChan = sb
    .channel('draftly-room')

    // New messages
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
    }, async payload => {
      const msg = payload.new;
      allMessages.push(msg);
      renderMessages();

      // If the new message is from the other user, mark it seen
      if (msg.sender === otherEmail) {
        await markMessagesSeen();
      }
    })

    // Message updates (seen field)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
    }, payload => {
      const updated = payload.new;
      const idx = allMessages.findIndex(m => m.id === updated.id);
      if (idx !== -1) {
        allMessages[idx] = updated;
        renderMessages();
      }
    })

    // Typing status changes
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'typing_status',
      filter: otherEmail ? `user_email=eq.${otherEmail}` : undefined,
    }, payload => {
      const row = payload.new || payload.old;
      if (row && row.user_email === otherEmail) {
        updateTypingIndicator(row.is_typing);
      }
    })

    .subscribe();
}

// ─────────────────────────────────────────────
// 12. RENDER MESSAGES
// ─────────────────────────────────────────────

function renderMessages() {
  const feed = UI.messagesFeed;

  // Remove all draft entries (keep #feed-empty)
  feed.querySelectorAll('.draft-entry').forEach(el => el.remove());

  if (allMessages.length === 0) {
    UI.feedEmpty.classList.remove('hidden');
    return;
  }

  UI.feedEmpty.classList.add('hidden');
  const myEmail = currentUser.email.toLowerCase();

  allMessages.forEach((msg, idx) => {
    const isSelf   = msg.sender.toLowerCase() === myEmail;
    const isLast   = idx === allMessages.length - 1;
    const isLastFromOther = !isSelf && isLast;
    const isLastFromSelf  = isSelf  && isLast;

    const entry = document.createElement('div');
    entry.className = `draft-entry ${isSelf ? 'self' : 'other'}`;
    entry.dataset.id = msg.id;

    // Meta row
    const meta = document.createElement('div');
    meta.className = 'entry-meta';

    const sender = document.createElement('span');
    sender.className = 'entry-sender';
    sender.textContent = isSelf ? 'You' : formatEmail(msg.sender);

    const time = document.createElement('span');
    time.className = 'entry-time';
    time.textContent = formatTime(msg.created_at);

    meta.appendChild(sender);
    meta.appendChild(time);

    // Body
    const body = document.createElement('div');
    body.className = 'entry-body';
    body.textContent = msg.content;

    entry.appendChild(meta);
    entry.appendChild(body);

    // Seen indicator — only on last message from self if it was seen
    if (isLastFromSelf && msg.seen) {
      const seen = document.createElement('span');
      seen.className = 'entry-seen';
      seen.textContent = 'Seen';
      entry.appendChild(seen);
    }

    feed.appendChild(entry);
  });

  scrollToBottom();
}

// ─────────────────────────────────────────────
// 13. TYPING INDICATOR UI
// ─────────────────────────────────────────────

function updateTypingIndicator(typing) {
  if (!otherEmail) return;
  if (typing) {
    const name = formatEmail(otherEmail);
    UI.typingIndicator.textContent = `${name} is typing...`;
    UI.typingIndicator.classList.remove('hidden');
  } else {
    UI.typingIndicator.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────
// 14. ONLINE STATUS
// ─────────────────────────────────────────────

function startHeartbeat(email) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => updateLastActive(email), ACTIVE_HEARTBEAT_MS);
}

function startStatusPoll() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  pollOtherUserStatus(); // immediate first poll
  statusPollTimer = setInterval(pollOtherUserStatus, STATUS_POLL_MS);
}

async function pollOtherUserStatus() {
  if (!otherEmail) return;

  const { data, error } = await sb.from('users')
    .select('last_active')
    .eq('email', otherEmail)
    .maybeSingle();

  if (error || !data) {
    setOtherUserOffline();
    return;
  }

  const lastActive = new Date(data.last_active).getTime();
  const now = Date.now();
  const online = (now - lastActive) < ACTIVE_THRESHOLD_MS;

  if (online) setOtherUserOnline();
  else         setOtherUserOffline();
}

function setOtherUserOnline() {
  UI.otherUserDot.className = 'other-user-dot online';
  UI.otherUserLabel.textContent = `${formatEmail(otherEmail)} · Online`;
}

function setOtherUserOffline() {
  UI.otherUserDot.className = 'other-user-dot offline';
  UI.otherUserLabel.textContent = `${formatEmail(otherEmail)} · Offline`;
}

// ─────────────────────────────────────────────
// 15. INPUT HANDLING
// ─────────────────────────────────────────────

UI.messageInput.addEventListener('input', () => {
  autoResizeTextarea(UI.messageInput);

  // Typing status
  setTyping(true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => setTyping(false), TYPING_DEBOUNCE_MS);
});

UI.messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

UI.sendBtn.addEventListener('click', handleSend);

async function handleSend() {
  const content = UI.messageInput.value;
  if (!content.trim()) return;

  UI.sendBtn.disabled = true;
  UI.messageInput.value = '';
  autoResizeTextarea(UI.messageInput);

  clearTimeout(typingTimer);
  await setTyping(false);

  await sendMessage(content);
  UI.sendBtn.disabled = false;
  UI.messageInput.focus();
}

// ─────────────────────────────────────────────
// 16. SIDEBAR TOGGLE (mobile)
// ─────────────────────────────────────────────

UI.sidebarToggle.addEventListener('click', () => {
  const open = UI.sidebar.classList.toggle('open');
  UI.sidebarOverlay.classList.toggle('visible', open);
  UI.sidebarOverlay.classList.toggle('hidden', !open);
});

UI.sidebarOverlay.addEventListener('click', closeSidebar);

function closeSidebar() {
  UI.sidebar.classList.remove('open');
  UI.sidebarOverlay.classList.remove('visible');
  UI.sidebarOverlay.classList.add('hidden');
}

// View router — sidebar nav
document.querySelectorAll('.nav-item:not(.disabled)').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const id = item.id;
    if (id === 'nav-dashboard') navigateTo('dashboard');
    else if (id === 'nav-drafts')    navigateTo('drafts');
    else if (id === 'nav-tasks')     navigateTo('tasks');
    else if (id === 'nav-ideas')     navigateTo('notes');
    closeSidebar();
  });
});

// ─────────────────────────────────────────────
// 17. UTILITIES
// ─────────────────────────────────────────────

function scrollToBottom() {
  const feed = UI.messagesFeed;
  feed.scrollTop = feed.scrollHeight;
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatEmail(email) {
  if (!email) return '';
  return email.split('@')[0];
}

// ─────────────────────────────────────────────
// 18. CLEANUP
// ─────────────────────────────────────────────

async function cleanup() {
  if (heartbeatTimer)  clearInterval(heartbeatTimer);
  if (statusPollTimer) clearInterval(statusPollTimer);
  if (typingTimer)     clearTimeout(typingTimer);
  if (realtimeChan)    await sb.removeChannel(realtimeChan);

  if (currentUser) {
    await setTyping(false);
  }
}

// ─────────────────────────────────────────────
// 19. PAGE VISIBILITY — pause/resume
// ─────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // User left tab — clear typing
    if (isTyping) setTyping(false);
  } else {
    // User returned — mark messages seen
    if (currentUser) {
      markMessagesSeen();
      updateLastActive(currentUser.email.toLowerCase());
    }
  }
});

// ─────────────────────────────────────────────
// 20. VIEW ROUTER
// ─────────────────────────────────────────────

let currentView = 'dashboard';

function navigateTo(view) {
  currentView = view;

  // Toggle views
  UI.dashboardView.classList.toggle('hidden', view !== 'dashboard');
  UI.draftsView.classList.toggle('hidden',    view !== 'drafts');
  UI.tasksView.classList.toggle('hidden',     view !== 'tasks');
  UI.notesView.classList.toggle('hidden',     view !== 'notes');

  // Show/hide compose bar
  UI.app.classList.toggle('no-compose', view !== 'drafts');

  // Sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navMap = { dashboard: 'nav-dashboard', drafts: 'nav-drafts', tasks: 'nav-tasks', notes: 'nav-ideas' };
  const activeNav = $(navMap[view]);
  if (activeNav) activeNav.classList.add('active');

  // Nav title
  const titles = { dashboard: 'Dashboard', drafts: 'My Drafts', tasks: 'Tasks', notes: 'Quick Notes' };
  UI.navTitleEl.textContent = titles[view] || 'Draftly';

  // Refresh dashboard stats when switching to it
  if (view === 'dashboard') updateDashboardStats();
}

// ─────────────────────────────────────────────
// 21. DASHBOARD STATS
// ─────────────────────────────────────────────

function updateDashboardStats() {
  const total    = allTasks.length;
  const done     = allTasks.filter(t => t.is_completed).length;
  const notesCnt = allNotes.length;
  const draftCnt = allMessages.length;

  UI.statTotalTasks.textContent  = total;
  UI.statDoneTasks.textContent   = done;
  UI.statNotesCount.textContent  = notesCnt;
  UI.statDraftsCount.textContent = draftCnt;

  // Recent tasks preview (last 3)
  UI.dashTasksPreview.innerHTML = '';
  const recentTasks = [...allTasks].slice(-3).reverse();
  if (recentTasks.length === 0) {
    UI.dashTasksPreview.innerHTML = '<p class="preview-empty">No tasks yet.</p>';
  } else {
    recentTasks.forEach(t => {
      const el = document.createElement('div');
      el.className = `preview-item${t.is_completed ? ' done-preview' : ''}`;
      el.innerHTML = `<span style="color:var(--text-muted);font-size:0.75rem">${t.is_completed ? '✓' : '◻'}</span><span>${escapeHtml(t.content)}</span>`;
      UI.dashTasksPreview.appendChild(el);
    });
  }

  // Recent notes preview (last 3)
  UI.dashNotesPreview.innerHTML = '';
  const recentNotes = [...allNotes].slice(-3).reverse();
  if (recentNotes.length === 0) {
    UI.dashNotesPreview.innerHTML = '<p class="preview-empty">No notes yet.</p>';
  } else {
    recentNotes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'preview-item';
      el.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(n.content.split('\n')[0])}</span>`;
      UI.dashNotesPreview.appendChild(el);
    });
  }
}

// Dashboard quick-links
UI.dashGotoTasks.addEventListener('click', e => { e.preventDefault(); navigateTo('tasks'); });
UI.dashGotoNotes.addEventListener('click', e => { e.preventDefault(); navigateTo('notes'); });

// ─────────────────────────────────────────────
// 22. TASKS
// ─────────────────────────────────────────────

let allTasks = [];

async function loadTasks() {
  const { data, error } = await sb.from('tasks')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.warn('loadTasks:', error.message); return; }
  allTasks = data || [];
  renderTasks();
  updateDashboardStats();
}

function renderTasks() {
  UI.tasksList.querySelectorAll('.task-item').forEach(el => el.remove());
  UI.tasksEmpty.classList.toggle('hidden', allTasks.length > 0);

  allTasks.forEach(task => {
    const item = document.createElement('div');
    item.className = `task-item${task.is_completed ? ' completed' : ''}`;
    item.dataset.id = task.id;
    item.innerHTML = `
      <div class="task-checkbox" data-id="${task.id}">
        <span class="task-checkbox-tick">✓</span>
      </div>
      <span class="task-content">${escapeHtml(task.content)}</span>
      <span class="task-time">${formatTime(task.created_at)}</span>
      <button class="item-delete" data-id="${task.id}" title="Delete">✕</button>
    `;
    UI.tasksList.appendChild(item);
  });
}

UI.taskAddBtn.addEventListener('click', addTask);
UI.taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

async function addTask() {
  const content = UI.taskInput.value.trim();
  if (!content) return;
  UI.taskInput.value = '';

  const { data, error } = await sb.from('tasks').insert({
    content,
    is_completed: false,
  }).select().single();

  if (error) { console.error('addTask:', error.message); return; }
  allTasks.push(data);
  renderTasks();
  updateDashboardStats();
}

UI.tasksList.addEventListener('click', async e => {
  // Toggle complete
  const checkbox = e.target.closest('.task-checkbox');
  if (checkbox) {
    const id = checkbox.dataset.id;
    const task = allTasks.find(t => t.id === id);
    if (!task) return;
    const newVal = !task.is_completed;
    const { error } = await sb.from('tasks').update({ is_completed: newVal }).eq('id', id);
    if (!error) {
      task.is_completed = newVal;
      renderTasks();
      updateDashboardStats();
    }
  }

  // Delete
  const delBtn = e.target.closest('.item-delete');
  if (delBtn) {
    const id = delBtn.dataset.id;
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (!error) {
      allTasks = allTasks.filter(t => t.id !== id);
      renderTasks();
      updateDashboardStats();
    }
  }
});

// ─────────────────────────────────────────────
// 23. QUICK NOTES
// ─────────────────────────────────────────────

let allNotes = [];

async function loadNotes() {
  const { data, error } = await sb.from('notes')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.warn('loadNotes:', error.message); return; }
  allNotes = data || [];
  renderNotes();
  updateDashboardStats();
}

function renderNotes() {
  UI.notesList.querySelectorAll('.note-item').forEach(el => el.remove());
  UI.notesEmpty.classList.toggle('hidden', allNotes.length > 0);

  [...allNotes].reverse().forEach(note => {
    const item = document.createElement('div');
    item.className = 'note-item';
    item.dataset.id = note.id;
    item.innerHTML = `
      <div class="note-content">${escapeHtml(note.content)}</div>
      <div class="note-footer">
        <span class="note-time">${formatTime(note.created_at)}</span>
        <button class="item-delete" data-id="${note.id}" title="Delete">✕</button>
      </div>
    `;
    UI.notesList.appendChild(item);
  });
}

UI.noteAddBtn.addEventListener('click', addNote);
UI.noteInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); }
});

async function addNote() {
  const content = UI.noteInput.value.trim();
  if (!content) return;
  UI.noteInput.value = '';
  UI.noteInput.style.height = 'auto';

  const { data, error } = await sb.from('notes').insert({ content }).select().single();
  if (error) { console.error('addNote:', error.message); return; }
  allNotes.push(data);
  renderNotes();
  updateDashboardStats();
}

UI.notesList.addEventListener('click', async e => {
  const delBtn = e.target.closest('.item-delete');
  if (delBtn) {
    const id = delBtn.dataset.id;
    const { error } = await sb.from('notes').delete().eq('id', id);
    if (!error) {
      allNotes = allNotes.filter(n => n.id !== id);
      renderNotes();
      updateDashboardStats();
    }
  }
});

// Auto-resize note textarea
UI.noteInput.addEventListener('input', () => {
  UI.noteInput.style.height = 'auto';
  UI.noteInput.style.height = Math.min(UI.noteInput.scrollHeight, 150) + 'px';
});

// ─────────────────────────────────────────────
// 24. STUDY TIMER
// ─────────────────────────────────────────────

let timerInterval  = null;
let timerSeconds   = 0;
let timerRunning   = false;

function initTimer() {
  UI.timerStart.addEventListener('click', () => {
    if (timerRunning) return;
    timerRunning = true;
    UI.timerStart.disabled = true;
    UI.timerPause.disabled = false;
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerDisplay();
    }, 1000);
  });

  UI.timerPause.addEventListener('click', () => {
    if (!timerRunning) return;
    timerRunning = false;
    clearInterval(timerInterval);
    UI.timerStart.disabled = false;
    UI.timerStart.textContent = 'Resume';
    UI.timerPause.disabled = true;
  });

  UI.timerReset.addEventListener('click', () => {
    timerRunning = false;
    clearInterval(timerInterval);
    timerSeconds = 0;
    updateTimerDisplay();
    UI.timerStart.disabled = false;
    UI.timerStart.textContent = 'Start';
    UI.timerPause.disabled = true;
  });
}

function updateTimerDisplay() {
  const h = Math.floor(timerSeconds / 3600);
  const m = Math.floor((timerSeconds % 3600) / 60);
  const s = timerSeconds % 60;
  UI.timerDisplay.textContent =
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0');
}

// ─────────────────────────────────────────────
// 25. ENHANCED ONLINE STATUS + LAST SEEN
// ─────────────────────────────────────────────

async function pollOtherUserStatusEnhanced() {
  if (!otherEmail) return;

  const { data, error } = await sb.from('users')
    .select('last_active')
    .eq('email', otherEmail)
    .maybeSingle();

  if (error || !data) {
    setOtherUserOffline();
    updateNavOtherStatus(null);
    return;
  }

  const lastActive = new Date(data.last_active).getTime();
  const now = Date.now();
  const online = (now - lastActive) < ACTIVE_THRESHOLD_MS;

  if (online) {
    setOtherUserOnline();
    updateNavOtherStatus('online');
  } else {
    setOtherUserOffline();
    updateNavOtherStatus(new Date(data.last_active));
  }
}

function updateNavOtherStatus(lastActiveDate) {
  // Update the navbar status text for current user (self is always Online)
  // Show other user's status as a subtle subtitle below the email
  let statusText = '';
  if (lastActiveDate === 'online') {
    statusText = 'Online';
    UI.navStatus.className = 'status-badge status-online';
  } else if (lastActiveDate === null) {
    statusText = 'Offline';
    UI.navStatus.className = 'status-badge status-offline';
  } else {
    const timeStr = formatTime(lastActiveDate.toISOString());
    statusText = `Last seen ${timeStr}`;
    UI.navStatus.className = 'status-badge status-last-seen';
  }
  UI.navStatus.textContent = statusText;
}

// Override the existing startStatusPoll to use the enhanced version
function startStatusPollEnhanced() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  pollOtherUserStatusEnhanced();
  statusPollTimer = setInterval(pollOtherUserStatusEnhanced, STATUS_POLL_MS);
}

// Also subscribe to users table for real-time last_active updates
function subscribeUserStatus() {
  if (!otherEmail) return;
  sb.channel('draftly-user-status')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'users',
      filter: `email=eq.${otherEmail}`,
    }, payload => {
      if (!payload.new) return;
      const lastActive = new Date(payload.new.last_active).getTime();
      const online = (Date.now() - lastActive) < ACTIVE_THRESHOLD_MS;
      if (online) {
        setOtherUserOnline();
        updateNavOtherStatus('online');
      } else {
        setOtherUserOffline();
        updateNavOtherStatus(new Date(payload.new.last_active));
      }
    })
    .subscribe();
}

// ─────────────────────────────────────────────
// 26. UTILITY — HTML escape
// ─────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// 27. BOOT
// ─────────────────────────────────────────────

// Patch startStatusPoll to use enhanced version
const _origStartStatusPoll = startStatusPoll;
function startStatusPoll() {
  startStatusPollEnhanced();
}

(async () => {
  showScreen(UI.loginScreen);
  await restoreSession();
})();
