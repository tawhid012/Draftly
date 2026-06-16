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
let allMessages      = [];     // cached messages array
let editingMessageId = null;   // ID of message being edited

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
  editBanner:       $('edit-banner'),
  cancelEditBtn:    $('cancel-edit-btn'),

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

  // Media — attachments & voice
  attachBtn:        $('attach-btn'),
  imageFileInput:   $('image-file-input'),
  recordBtn:        $('record-btn'),
  recordingBar:     $('recording-bar'),
  recTimer:         $('rec-timer'),

  // Call UI
  btnVoiceCall:     $('btn-voice-call'),
  btnVideoCall:     $('btn-video-call'),
  incomingBanner:   $('incoming-call-banner'),
  incomingName:     $('incoming-call-name'),
  incomingType:     $('incoming-call-type'),
  incomingIcon:     $('incoming-call-icon'),
  callAcceptBtn:    $('call-accept-btn'),
  callDeclineBtn:   $('call-decline-btn'),
  callOverlay:      $('call-overlay'),
  remoteVideo:      $('remote-video'),
  localVideo:       $('local-video'),
  callPeerName:     $('call-peer-name'),
  callStatus:       $('call-status'),
  callDuration:     $('call-duration'),
  callMuteBtn:      $('call-mute-btn'),
  callCamBtn:       $('call-cam-btn'),
  callEndBtn:       $('call-end-btn'),

  // Lightbox
  imgLightbox:      $('img-lightbox'),
  imgLightboxImg:   $('img-lightbox-img'),
  imgLightboxClose: $('img-lightbox-close'),
  imgLightboxBg:    $('img-lightbox-bg'),

  // Archive / Live Location view
  archiveView:      $('archive-view'),
  locCenterBtn:     $('loc-center-btn'),
  myLocDot:         $('my-loc-dot'),
  myLocText:        $('my-loc-text'),
  otherLocDot:      $('other-loc-dot'),
  otherLocText:     $('other-loc-text'),
  locCoordsInfo:    $('loc-coords-info'),
  locPermDenied:    $('loc-permission-denied'),
  locPermMsg:       $('loc-perm-msg'),
  locPermSteps:     $('loc-perm-steps'),
  locRetryBtn:      $('loc-retry-btn'),
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

  // Subscribe to call signaling
  subscribeCallSignaling();

  // Subscribe to location channel (receive location even if not on map tab)
  subscribeLocationChannel();

  // Automatically start sharing location
  startSharingLocation();

  // Load offline location for collaborator
  loadOfflineLocation();
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
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { console.error('loadMessages:', error.message); return; }

  allMessages = (data || []).reverse();
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

    // Message deletes
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'messages',
    }, payload => {
      const deletedId = payload.old.id;
      allMessages = allMessages.filter(m => m.id !== deletedId);
      renderMessages();
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

  feed.querySelectorAll('.draft-entry').forEach(el => el.remove());

  if (allMessages.length === 0) {
    UI.feedEmpty.classList.remove('hidden');
    return;
  }

  UI.feedEmpty.classList.add('hidden');
  const myEmail = currentUser.email.toLowerCase();

  allMessages.forEach((msg, idx) => {
    const isSelf  = msg.sender.toLowerCase() === myEmail;
    const isLast  = idx === allMessages.length - 1;
    const isLastFromSelf = isSelf && isLast;
    const msgType = msg.type || 'text';

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
    entry.appendChild(meta);

    const wrapper = document.createElement('div');
    wrapper.className = 'entry-content-wrapper';

    // Actions (only for self)
    if (isSelf) {
      const actions = document.createElement('div');
      actions.className = 'entry-actions';

      const menuBtn = document.createElement('button');
      menuBtn.className = 'action-menu-btn';
      menuBtn.innerHTML = '⋮';
      
      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu hidden';

      if (msgType === 'text') {
        const editItem = document.createElement('button');
        editItem.className = 'dropdown-item';
        editItem.textContent = 'Edit message';
        editItem.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.add('hidden');
          editMessageInit(msg.id, msg.content);
        });
        dropdown.appendChild(editItem);
      }

      const delItem = document.createElement('button');
      delItem.className = 'dropdown-item delete';
      delItem.textContent = 'Delete message';
      delItem.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.add('hidden');
        deleteMessage(msg.id);
      });
      dropdown.appendChild(delItem);

      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Hide all other dropdowns
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
        dropdown.classList.remove('hidden');
      });

      actions.appendChild(menuBtn);
      actions.appendChild(dropdown);
      wrapper.appendChild(actions);
    }

    // Body — different per type
    if (msgType === 'image' && msg.file_url) {
      const body = document.createElement('div');
      body.className = 'entry-body';
      body.style.padding = '8px';
      const img = document.createElement('img');
      img.className = 'entry-image';
      img.src = msg.file_url;
      img.alt = msg.file_name || 'Image';
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(msg.file_url));
      body.appendChild(img);
      if (msg.content && msg.content !== msg.file_name) {
        const cap = document.createElement('p');
        cap.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);margin-top:6px;';
        cap.textContent = msg.content;
        body.appendChild(cap);
      }
      wrapper.appendChild(body);
    } else if (msgType === 'voice' && msg.file_url) {
      const body = document.createElement('div');
      body.className = 'entry-body entry-audio';
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = msg.file_url;
      audio.preload = 'none';
      const label = document.createElement('span');
      label.className = 'audio-label';
      label.textContent = 'Voice note';
      body.appendChild(audio);
      body.appendChild(label);
      wrapper.appendChild(body);
    } else {
      const body = document.createElement('div');
      body.className = 'entry-body';
      body.textContent = msg.content || '';
      wrapper.appendChild(body);
    }

    entry.appendChild(wrapper);

    // Seen indicator
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

  const isEditing = editingMessageId !== null;
  const currentEditId = editingMessageId;

  UI.messageInput.value = '';
  autoResizeTextarea(UI.messageInput);
  if (isEditing) cancelEditMessage();

  clearTimeout(typingTimer);
  await setTyping(false);

  if (isEditing) {
    const { error } = await sb.from('messages').update({ content: content.trim() }).eq('id', currentEditId);
    if (error) showToast('Failed to edit message.', 'error');
  } else {
    await sendMessage(content);
  }
  
  UI.sendBtn.disabled = false;
  UI.messageInput.focus();
}

async function deleteMessage(id) {
  const { error } = await sb.from('messages').delete().eq('id', id);
  if (error) showToast('Failed to delete message.', 'error');
}

function editMessageInit(id, content) {
  editingMessageId = id;
  UI.messageInput.value = content;
  autoResizeTextarea(UI.messageInput);
  UI.messageInput.focus();
  UI.editBanner.classList.remove('hidden');
}

function cancelEditMessage() {
  editingMessageId = null;
  UI.messageInput.value = '';
  autoResizeTextarea(UI.messageInput);
  UI.editBanner.classList.add('hidden');
}

if(UI.cancelEditBtn) UI.cancelEditBtn.addEventListener('click', cancelEditMessage);

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
    else if (id === 'nav-drafts')   navigateTo('drafts');
    else if (id === 'nav-tasks')    navigateTo('tasks');
    else if (id === 'nav-ideas')    navigateTo('notes');
    else if (id === 'nav-archive')  navigateTo('archive');
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
  UI.archiveView.classList.toggle('hidden',   view !== 'archive');

  // Show/hide compose bar
  UI.app.classList.toggle('no-compose', view !== 'drafts');

  // Sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navMap = { dashboard: 'nav-dashboard', drafts: 'nav-drafts', tasks: 'nav-tasks', notes: 'nav-ideas', archive: 'nav-archive' };
  const activeNav = $(navMap[view]);
  if (activeNav) activeNav.classList.add('active');

  // Nav title
  const titles = { dashboard: 'Dashboard', drafts: 'My Drafts', tasks: 'Tasks', notes: 'Quick Notes', archive: 'Live Location' };
  UI.navTitleEl.textContent = titles[view] || 'Draftly';

  // Refresh dashboard stats when switching to it
  if (view === 'dashboard') updateDashboardStats();

  // Init map when first navigating to archive
  if (view === 'archive') initLocationMap();
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
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.warn('loadTasks:', error.message); return; }
  allTasks = (data || []).reverse();
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
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.warn('loadNotes:', error.message); return; }
  allNotes = (data || []).reverse();
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

// ─────────────────────────────────────────────
// 28. IMAGE ATTACHMENTS
// ─────────────────────────────────────────────

UI.attachBtn.addEventListener('click', () => UI.imageFileInput.click());

UI.imageFileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const MAX = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX) { showToast('Image too large (max 10 MB).', 'error'); return; }

  const ext  = file.name.split('.').pop();
  const path = `images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  // Visual uploading state
  UI.attachBtn.classList.add('uploading');
  UI.attachBtn.title = 'Uploading...';

  const { error: uploadErr } = await sb.storage
    .from('draftly-media')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadErr) {
    showToast(`Upload failed: ${uploadErr.message}`, 'error');
    UI.attachBtn.classList.remove('uploading');
    UI.attachBtn.title = 'Attach image';
    return;
  }

  const { data: { publicUrl } } = sb.storage
    .from('draftly-media')
    .getPublicUrl(path);

  const { error: msgErr } = await sb.from('messages').insert({
    content:   file.name,
    sender:    currentUser.email.toLowerCase(),
    seen:      false,
    type:      'image',
    file_url:  publicUrl,
    file_name: file.name,
  });

  if (msgErr) {
    showToast(`Could not save image: ${msgErr.message}`, 'error');
  } else {
    showToast('Image sent ✓', 'success');
  }

  UI.attachBtn.classList.remove('uploading');
  UI.attachBtn.title = 'Attach image';
});

// Image lightbox
function openLightbox(src) {
  UI.imgLightboxImg.src = src;
  UI.imgLightbox.classList.remove('hidden');
}

UI.imgLightboxClose.addEventListener('click', () => UI.imgLightbox.classList.add('hidden'));
UI.imgLightboxBg.addEventListener('click',    () => UI.imgLightbox.classList.add('hidden'));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') UI.imgLightbox.classList.add('hidden');
});

// ─────────────────────────────────────────────
// 29. VOICE MESSAGES
// ─────────────────────────────────────────────

let mediaRecorder  = null;
let recChunks      = [];
let recSeconds     = 0;
let recInterval    = null;
let isRecording    = false;
const MAX_REC_SECS = 120;

UI.recordBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  else              startRecording();
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks  = [];
    recSeconds = 0;
    isRecording = true;

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      uploadVoiceMessage(new Blob(recChunks, { type: 'audio/webm' }));
    };
    mediaRecorder.start(250);

    UI.recordBtn.classList.add('recording');
    UI.recordingBar.classList.remove('hidden');

    recInterval = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds / 60);
      const s = recSeconds % 60;
      UI.recTimer.textContent = `${m}:${String(s).padStart(2,'0')}`;
      if (recSeconds >= MAX_REC_SECS) stopRecording();
    }, 1000);
  } catch (err) {
    console.error('Mic access:', err);
    alert('Microphone access denied.');
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  clearInterval(recInterval);
  mediaRecorder.stop();
  UI.recordBtn.classList.remove('recording');
  UI.recordingBar.classList.add('hidden');
  UI.recTimer.textContent = '0:00';
}

async function uploadVoiceMessage(blob) {
  const path = `voice/${Date.now()}_${Math.random().toString(36).slice(2)}.webm`;

  const { error: uploadErr } = await sb.storage
    .from('draftly-media')
    .upload(path, blob, { contentType: 'audio/webm', upsert: false });

  if (uploadErr) { console.error('Voice upload:', uploadErr.message); return; }

  const { data: { publicUrl } } = sb.storage
    .from('draftly-media')
    .getPublicUrl(path);

  const { error: msgErr } = await sb.from('messages').insert({
    content:   'Voice note',
    sender:    currentUser.email.toLowerCase(),
    seen:      false,
    type:      'voice',
    file_url:  publicUrl,
    file_name: path,
  });

  if (msgErr) console.error('Voice message:', msgErr.message);
}

// ─────────────────────────────────────────────
// 30. WEBRTC CALLING — SIGNALING
// ─────────────────────────────────────────────

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let callChannel      = null;  // Supabase broadcast channel
let peerConn         = null;  // RTCPeerConnection
let localStream      = null;  // local media stream
let callType         = null;  // 'voice' | 'video'
let callRole         = null;  // 'caller' | 'callee'
let pendingOffer     = null;  // stored offer for accept
let callDurInterval  = null;
let callDurSecs      = 0;
let callMuted        = false;
let pendingCandidates = [];

function subscribeCallSignaling() {
  if (callChannel) sb.removeChannel(callChannel);

  callChannel = sb
    .channel('draftly-call', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'call-offer' }, async ({ payload }) => {
      if (!payload || payload.to !== currentUser.email.toLowerCase()) return;
      pendingOffer = payload;
      showIncomingCall(payload);
    })
    .on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
      if (!peerConn || callRole !== 'caller') return;
      try {
        await peerConn.setRemoteDescription(new RTCSessionDescription(payload.answer));
        pendingCandidates.forEach(c => peerConn.addIceCandidate(new RTCIceCandidate(c)));
        pendingCandidates = [];
        $('call-status').textContent = 'Connected';
        startCallDuration();
      } catch(e) { console.error('setRemote answer:', e); }
    })
    .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
      if (!peerConn || payload.to !== currentUser.email.toLowerCase()) return;
      try {
        if (!peerConn.remoteDescription) {
          pendingCandidates.push(payload.candidate);
        } else {
          await peerConn.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch(e) { /* ignore late ICE */ }
    })
    .on('broadcast', { event: 'call-end' }, () => {
      if (peerConn) endCall(false);
    })
    .on('broadcast', { event: 'call-reject' }, () => {
      if (callRole === 'caller') {
        endCall(false);
        UI.callStatus.textContent = 'Call declined';
      }
    })
    .subscribe();
}

async function broadcastSignal(event, payload) {
  await callChannel.send({ type: 'broadcast', event, payload });
}

// ─────────────────────────────────────────────
// 31. WEBRTC CALLING — INITIATE
// ─────────────────────────────────────────────

UI.btnVoiceCall.addEventListener('click', () => initiateCall('voice'));
UI.btnVideoCall.addEventListener('click', () => initiateCall('video'));

async function initiateCall(type) {
  if (peerConn) return; // already in a call
  callType = type;
  callRole = 'caller';

  try {
    localStream = await navigator.mediaDevices.getUserMedia(
      type === 'video' ? { audio: true, video: true } : { audio: true }
    );
  } catch(e) {
    alert(`Could not access ${type === 'video' ? 'camera/microphone' : 'microphone'}.`);
    return;
  }

  showCallOverlay('Calling...', type);
  setupPeerConnection();

  localStream.getTracks().forEach(t => peerConn.addTrack(t, localStream));

  if (type === 'video') {
    UI.localVideo.srcObject = localStream;
    UI.localVideo.classList.add('visible');
    UI.callCamBtn.classList.remove('hidden');
  }

  const offer = await peerConn.createOffer();
  await peerConn.setLocalDescription(offer);

  await broadcastSignal('call-offer', {
    from:  currentUser.email.toLowerCase(),
    to:    otherEmail,
    type,
    offer: peerConn.localDescription,
  });
}

// ─────────────────────────────────────────────
// 32. WEBRTC CALLING — INCOMING
// ─────────────────────────────────────────────

function showIncomingCall(payload) {
  UI.incomingName.textContent = formatEmail(payload.from) + ' is calling';
  UI.incomingType.textContent = payload.type === 'video' ? 'Video call' : 'Voice call';
  UI.incomingIcon.textContent = payload.type === 'video' ? '\u{1F4F9}' : '\u260E';
  UI.incomingBanner.classList.remove('hidden');
}

UI.callAcceptBtn.addEventListener('click', async () => {
  if (!pendingOffer) return;
  UI.incomingBanner.classList.add('hidden');

  callType = pendingOffer.type;
  callRole = 'callee';

  try {
    localStream = await navigator.mediaDevices.getUserMedia(
      callType === 'video' ? { audio: true, video: true } : { audio: true }
    );
  } catch(e) {
    alert('Could not access microphone/camera.');
    return;
  }

  showCallOverlay('Connecting...', callType);
  setupPeerConnection();
  localStream.getTracks().forEach(t => peerConn.addTrack(t, localStream));

  if (callType === 'video') {
    UI.localVideo.srcObject = localStream;
    UI.localVideo.classList.add('visible');
    UI.callCamBtn.classList.remove('hidden');
  }

  await peerConn.setRemoteDescription(new RTCSessionDescription(pendingOffer.offer));
  pendingCandidates.forEach(c => peerConn.addIceCandidate(new RTCIceCandidate(c)));
  pendingCandidates = [];
  const answer = await peerConn.createAnswer();
  await peerConn.setLocalDescription(answer);

  await broadcastSignal('call-answer', {
    from:   currentUser.email.toLowerCase(),
    to:     pendingOffer.from,
    answer: peerConn.localDescription,
  });

  UI.callStatus.textContent = 'Connected';
  startCallDuration();
  pendingOffer = null;
});

UI.callDeclineBtn.addEventListener('click', () => {
  UI.incomingBanner.classList.add('hidden');
  pendingOffer = null;
  broadcastSignal('call-reject', { from: currentUser.email.toLowerCase() });
});

// ─────────────────────────────────────────────
// 33. WEBRTC — PEER CONNECTION SETUP
// ─────────────────────────────────────────────

function setupPeerConnection() {
  peerConn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  peerConn.onicecandidate = async e => {
    if (e.candidate) {
      await broadcastSignal('ice-candidate', {
        to:        otherEmail,
        candidate: e.candidate,
      });
    }
  };

  peerConn.ontrack = e => {
    if (UI.remoteVideo.srcObject !== e.streams[0]) {
      UI.remoteVideo.srcObject = e.streams[0];
      if (callType === 'video') {
        UI.remoteVideo.classList.add('active');
      }
    }
  };

  peerConn.onconnectionstatechange = () => {
    const state = peerConn.connectionState;
    if (state === 'connected') {
      UI.callStatus.textContent = 'Connected';
      startCallDuration();
    } else if (state === 'failed' || state === 'disconnected') {
      UI.callStatus.textContent = 'Connection lost';
      setTimeout(() => endCall(true), 2000);
    }
  };
}

// ─────────────────────────────────────────────
// 34. CALL OVERLAY UI & CONTROLS
// ─────────────────────────────────────────────

function showCallOverlay(statusText, type) {
  UI.callPeerName.textContent  = formatEmail(otherEmail || '');
  UI.callStatus.textContent    = statusText;
  UI.callDuration.textContent  = '0:00';
  UI.callOverlay.classList.remove('hidden');
  callDurSecs = 0;
}

function startCallDuration() {
  if (callDurInterval) clearInterval(callDurInterval);
  callDurInterval = setInterval(() => {
    callDurSecs++;
    const m = Math.floor(callDurSecs / 60);
    const s = callDurSecs % 60;
    UI.callDuration.textContent = `${m}:${String(s).padStart(2,'0')}`;
  }, 1000);
}

// Mute toggle
UI.callMuteBtn.addEventListener('click', () => {
  if (!localStream) return;
  callMuted = !callMuted;
  localStream.getAudioTracks().forEach(t => { t.enabled = !callMuted; });
  UI.callMuteBtn.classList.toggle('muted', callMuted);
  UI.callMuteBtn.textContent = callMuted ? '\u{1F507}' : '\u{1F508}';
});

// Camera toggle (video only)
UI.callCamBtn.addEventListener('click', () => {
  if (!localStream) return;
  const vid = localStream.getVideoTracks()[0];
  if (vid) vid.enabled = !vid.enabled;
});

// End call button
UI.callEndBtn.addEventListener('click', () => endCall(true));

function endCall(broadcast) {
  if (broadcast) broadcastSignal('call-end', { from: currentUser.email.toLowerCase() });

  if (peerConn)     { peerConn.close();     peerConn = null; }
  if (localStream)  { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (callDurInterval) { clearInterval(callDurInterval); callDurInterval = null; }

  UI.remoteVideo.srcObject = null;
  UI.localVideo.srcObject  = null;
  UI.remoteVideo.classList.remove('active');
  UI.localVideo.classList.remove('visible');
  UI.callCamBtn.classList.add('hidden');
  UI.callMuteBtn.classList.remove('muted');
  UI.callMuteBtn.textContent = '\u{1F508}';
  UI.callOverlay.classList.add('hidden');
  UI.incomingBanner.classList.add('hidden');

  callType = null; callRole = null; pendingOffer = null; callMuted = false; callDurSecs = 0; pendingCandidates = [];
}

// ─────────────────────────────────────────────
// 35. BOOT
// ─────────────────────────────────────────────

(async () => {
  showScreen(UI.loginScreen);
  await restoreSession();
})();

// ─────────────────────────────────────────────
// 36. TOAST NOTIFICATIONS
// ─────────────────────────────────────────────

let toastContainer = null;

function showToast(msg, type = 'info', duration = 3500) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const t = document.createElement('div');
  t.className = `toast${type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : ''}`;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 310); }, duration);
}

// ─────────────────────────────────────────────
// 37. LIVE LOCATION — LEAFLET + SUPABASE REALTIME
// ─────────────────────────────────────────────

let locationMap       = null;   // Leaflet map instance
let mapInitialized    = false;
let myMarker          = null;   // Leaflet marker for self
let otherMarker       = null;   // Leaflet marker for other user
let locationChannel   = null;   // Supabase realtime broadcast channel
let geoWatchId        = null;   // navigator.geolocation watchId
let isSharingLocation = false;
let lastMyPos         = null;
let lastOtherPos      = null;

let lastLocationDbUpdate = 0;
const LOC_DB_UPDATE_INTERVAL = 30000; // Save to DB every 30 seconds max

// Custom minimal marker icon factory
function makeMarkerIcon(color, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}"/>
    <circle cx="14" cy="14" r="6" fill="white" opacity="0.9"/>
    <text x="14" y="18" text-anchor="middle" font-size="8" font-family="Inter,sans-serif" font-weight="600" fill="${color}">${label}</text>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -38],
  });
}

let _locBtnsWired = false;

function initLocationMap() {
  // Wire buttons once, regardless of map init state
  if (!_locBtnsWired) {
    _locBtnsWired = true;
    UI.locCenterBtn.addEventListener('click', centerMap);
    UI.locRetryBtn.addEventListener('click', () => {
      UI.locPermDenied.classList.add('hidden');
      startSharingLocation();
    });
  }

  if (mapInitialized) {
    // Map already exists — just fix its size after the hidden div becomes visible
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (locationMap) {
          locationMap.invalidateSize({ animate: false });
          // Re-apply saved positions
          if (lastMyPos)    updateMyMarker(lastMyPos.lat, lastMyPos.lng, lastMyPos.accuracy);
          if (lastOtherPos) updateOtherMarker(lastOtherPos.lat, lastOtherPos.lng, lastOtherPos.accuracy || 0);
        }
      }, 150);
    });
    return;
  }
  mapInitialized = true;

  // Defer map creation one frame so the container has layout
  requestAnimationFrame(() => {
    // Default center: India
    locationMap = L.map('location-map', {
      center: [20.5937, 78.9629],
      zoom:   5,
      zoomControl: true,
      attributionControl: true,
    });

    // Google Maps tile layer
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      maxZoom: 20,
    }).addTo(locationMap);

    // Force size recalculation after tiles load
    setTimeout(() => locationMap.invalidateSize({ animate: false }), 200);

    // If we already have positions (received before map was open), apply them now
    if (lastMyPos)    updateMyMarker(lastMyPos.lat, lastMyPos.lng, lastMyPos.accuracy);
    if (lastOtherPos) updateOtherMarker(lastOtherPos.lat, lastOtherPos.lng, lastOtherPos.accuracy || 0);
  });
}

function subscribeLocationChannel() {
  if (locationChannel) sb.removeChannel(locationChannel);

  locationChannel = sb
    .channel('draftly-location', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'location-update' }, ({ payload }) => {
      if (!payload || payload.from !== otherEmail) return;
      // Always save last known position
      lastOtherPos = { lat: payload.lat, lng: payload.lng, accuracy: payload.accuracy, live: true };
      // Update marker if map is ready
      if (locationMap) {
        updateOtherMarker(payload.lat, payload.lng, payload.accuracy);
      } else {
        // Map not open yet — update status bar text so user knows
        UI.otherLocDot.className = 'loc-dot active';
        UI.otherLocText.textContent = `${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}`;
      }
    })
    .on('broadcast', { event: 'location-stop' }, ({ payload }) => {
      if (!payload || payload.from !== otherEmail) return;
      lastOtherPos = null;
      if (locationMap) clearOtherMarker();
      else {
        UI.otherLocDot.className = 'loc-dot inactive';
        UI.otherLocText.textContent = 'Stopped sharing';
      }
    })
    .subscribe();
}

async function broadcastLocation(lat, lng, accuracy) {
  if (!locationChannel) return;
  await locationChannel.send({
    type: 'broadcast',
    event: 'location-update',
    payload: { from: currentUser.email.toLowerCase(), lat, lng, accuracy },
  });
}

async function broadcastLocationStop() {
  if (!locationChannel) return;
  await locationChannel.send({
    type: 'broadcast',
    event: 'location-stop',
    payload: { from: currentUser.email.toLowerCase() },
  });
}

async function saveLocationToDB(lat, lng, accuracy) {
  const now = Date.now();
  if (now - lastLocationDbUpdate < LOC_DB_UPDATE_INTERVAL) return;

  lastLocationDbUpdate = now;
  const { error } = await sb.from('users').update({
    last_lat: lat,
    last_lng: lng,
    last_accuracy: accuracy,
    last_location_time: new Date().toISOString()
  }).eq('email', currentUser.email.toLowerCase());

  if (error) {
    console.warn('saveLocationToDB error:', error.message);
  }
}

async function loadOfflineLocation() {
  if (!otherEmail) return;

  const { data, error } = await sb.from('users')
    .select('last_lat, last_lng, last_accuracy, last_location_time')
    .eq('email', otherEmail)
    .maybeSingle();

  if (error || !data) return;

  if (data.last_lat && data.last_lng) {
    // If we haven't received a live broadcast yet, use the offline DB location
    if (!lastOtherPos || !lastOtherPos.live) {
      lastOtherPos = {
        lat: data.last_lat,
        lng: data.last_lng,
        accuracy: data.last_accuracy,
        time: data.last_location_time
      };

      if (locationMap) {
        updateOtherMarker(lastOtherPos.lat, lastOtherPos.lng, lastOtherPos.accuracy);
      } else {
        UI.otherLocDot.className = 'loc-dot inactive';
        UI.otherLocText.textContent = `Offline (Seen: ${formatTime(data.last_location_time)})`;
      }
    }
  }
}

async function startSharingLocation() {
  if (!navigator.geolocation) {
    showLocationPermDenied('not-supported');
    return;
  }

  // Proactively check permission state using Permissions API (if available)
  if (navigator.permissions) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'denied') {
        showLocationPermDenied('denied');
        return;
      }
      // 'prompt' or 'granted' — proceed and let the browser ask
    } catch (_) { /* Permissions API not fully supported — proceed anyway */ }
  }

  isSharingLocation = true;
  UI.locPermDenied.classList.add('hidden');
  UI.myLocDot.className = 'loc-dot active';
  UI.myLocText.textContent = 'Getting location...';

  geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      lastMyPos = { lat, lng, accuracy };
      updateMyMarker(lat, lng, accuracy);
      broadcastLocation(lat, lng, accuracy);
      saveLocationToDB(lat, lng, accuracy);
      UI.myLocText.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      UI.locCoordsInfo.textContent = `Your accuracy: \u00b1${Math.round(accuracy)}m`;
    },
    err => {
      stopSharingLocation();
      if (err.code === 1 /* PERMISSION_DENIED */) {
        showLocationPermDenied('denied');
      } else if (err.code === 2 /* POSITION_UNAVAILABLE */) {
        showToast('Location unavailable. Check your device\'s GPS/Location Services.', 'error', 5000);
      } else if (err.code === 3 /* TIMEOUT */) {
        showToast('Location request timed out. Try again in a moment.', 'error', 4000);
      } else {
        showToast(`Location error: ${err.message}`, 'error');
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function showLocationPermDenied(reason) {
  // Reset share button state
  UI.myLocDot.className = 'loc-dot inactive';
  UI.myLocText.textContent = 'Blocked';

  if (reason === 'not-supported') {
    UI.locPermMsg.textContent = 'Your browser does not support location sharing.';
    UI.locPermSteps.innerHTML = '<p>Please use a modern browser like Chrome, Firefox, or Safari.</p>';
    UI.locPermDenied.classList.remove('hidden');
    return;
  }

  // Detect browser
  const ua = navigator.userAgent;
  const isChrome  = /Chrome/.test(ua) && !/Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isSafari  = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isEdge    = /Edg/.test(ua);
  const isMobile  = /Android|iPhone|iPad/.test(ua);

  UI.locPermMsg.textContent = 'Location access was blocked. Follow the steps below to enable it, then click \u201cTry Again\u201d.';

  let steps = '';
  if (isMobile && /iPhone|iPad/.test(ua)) {
    steps = `<ol>
      <li>Open <code>Settings</code> on your iPhone/iPad</li>
      <li>Scroll to <code>Safari</code> (or your browser app)</li>
      <li>Tap <code>Location</code> \u2192 set to <code>Ask</code> or <code>Allow</code></li>
      <li>Come back to Draftly and tap <strong>Try Again</strong></li>
    </ol>`;
  } else if (isMobile && /Android/.test(ua)) {
    steps = `<ol>
      <li>Tap the <code>lock icon</code> or <code>&#128274;</code> in your browser's address bar</li>
      <li>Tap <code>Permissions</code> \u2192 <code>Location</code></li>
      <li>Select <code>Allow</code></li>
      <li>Tap <strong>Try Again</strong> below</li>
    </ol>`;
  } else if (isChrome) {
    steps = `<ol>
      <li>Click the <code>&#128274; lock</code> icon in the address bar (left of the URL)</li>
      <li>Click <code>Location</code> \u2192 change to <code>Allow</code></li>
      <li>Reload the page if prompted, then tap <strong>Try Again</strong></li>
    </ol>`;
  } else if (isFirefox) {
    steps = `<ol>
      <li>Click the <code>&#128274;</code> icon in the address bar</li>
      <li>Click the <code>X</code> next to <em>Blocked Temporarily</em> or <em>Block</em></li>
      <li>Select <code>Allow Location Access</code></li>
      <li>Click <strong>Try Again</strong> below</li>
    </ol>`;
  } else if (isSafari) {
    steps = `<ol>
      <li>In the menu bar go to <code>Safari \u2192 Settings for This Website</code></li>
      <li>Set <code>Location</code> to <code>Allow</code></li>
      <li>Click <strong>Try Again</strong> below</li>
    </ol>`;
  } else if (isEdge) {
    steps = `<ol>
      <li>Click the <code>&#128274;</code> icon in the address bar</li>
      <li>Click <code>Permissions for this site</code></li>
      <li>Set <code>Location</code> to <code>Allow</code></li>
      <li>Click <strong>Try Again</strong> below</li>
    </ol>`;
  } else {
    steps = `<ol>
      <li>Look for a <code>&#128274;</code> or location icon in your browser\'s address bar</li>
      <li>Click it and set Location to <code>Allow</code></li>
      <li>Click <strong>Try Again</strong> below</li>
    </ol>`;
  }

  UI.locPermSteps.innerHTML = steps;
  UI.locPermDenied.classList.remove('hidden');
}

function stopSharingLocation() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  isSharingLocation = false;
  UI.myLocDot.className = 'loc-dot inactive';
  UI.myLocText.textContent = 'Not sharing';
  UI.locCoordsInfo.textContent = '';

  // Remove my marker
  if (myMarker) { locationMap.removeLayer(myMarker); myMarker = null; }
  lastMyPos = null;

  // Tell other user we stopped
  broadcastLocationStop();
}

function updateMyMarker(lat, lng, accuracy) {
  if (!locationMap) return;
  const icon = makeMarkerIcon('#3d3d3a', 'You');
  if (!myMarker) {
    myMarker = L.marker([lat, lng], { icon })
      .addTo(locationMap)
      .bindPopup(`<b>You</b><br>${lat.toFixed(5)}, ${lng.toFixed(5)}<br>±${Math.round(accuracy)}m`);
    // Fly to first fix
    locationMap.flyTo([lat, lng], 15, { duration: 1.5 });
  } else {
    myMarker.setLatLng([lat, lng]);
    myMarker.setPopupContent(`<b>You</b><br>${lat.toFixed(5)}, ${lng.toFixed(5)}<br>±${Math.round(accuracy)}m`);
  }
}

function updateOtherMarker(lat, lng, accuracy) {
  if (!locationMap) return;
  const name = formatEmail(otherEmail || 'them');
  const icon = makeMarkerIcon('#4caf7d', name.slice(0, 3).toUpperCase());
  UI.otherLocDot.className = 'loc-dot active';
  UI.otherLocText.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  lastOtherPos = { lat, lng };

  if (!otherMarker) {
    otherMarker = L.marker([lat, lng], { icon })
      .addTo(locationMap)
      .bindPopup(`<b>${name}</b><br>${lat.toFixed(5)}, ${lng.toFixed(5)}<br>±${Math.round(accuracy)}m`);
  } else {
    otherMarker.setLatLng([lat, lng]);
    otherMarker.setPopupContent(`<b>${name}</b><br>${lat.toFixed(5)}, ${lng.toFixed(5)}<br>±${Math.round(accuracy)}m`);
  }

  // If both markers exist, fit map to show both
  if (myMarker && otherMarker) {
    const group = L.featureGroup([myMarker, otherMarker]);
    locationMap.fitBounds(group.getBounds().pad(0.3));
  } else {
    locationMap.flyTo([lat, lng], 14, { duration: 1.2 });
  }
}

function clearOtherMarker() {
  if (otherMarker) { locationMap.removeLayer(otherMarker); otherMarker = null; }
  UI.otherLocDot.className = 'loc-dot inactive';
  UI.otherLocText.textContent = 'Stopped sharing';
  lastOtherPos = null;
}

function centerMap() {
  if (!locationMap) return;
  if (myMarker && otherMarker) {
    locationMap.fitBounds(L.featureGroup([myMarker, otherMarker]).getBounds().pad(0.3));
  } else if (myMarker) {
    locationMap.flyTo(myMarker.getLatLng(), 15);
  } else if (otherMarker) {
    locationMap.flyTo(otherMarker.getLatLng(), 15);
  } else {
    showToast('No location to center on yet.', 'info');
  }
}

// ─────────────────────────────────────────────
// 41. GLOBAL EVENT LISTENERS
// ─────────────────────────────────────────────

document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-menu').forEach(m => {
    if (!m.classList.contains('hidden')) m.classList.add('hidden');
  });
});
