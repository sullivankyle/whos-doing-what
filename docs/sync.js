// Optional cloud sync (Google sign-in + Firestore). localStorage stays the working copy, so the
// app keeps working offline; this module merges with the server whenever it can.
//
// Server layout: one document per user, wdw/{uid} = { state: "<json>", updatedAt }.
// Merge: three-way by item id against the last state that synced (see merge.js).
import { firebaseConfig } from './firebase-config.js';
import { mergeState, statesEqual } from './merge.js';

const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const BASE_KEY = 'friend-tracker-sync-base-v1';
const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

let fb = null;            // lazily loaded firebase modules
let auth = null, db = null;
let user = null;
let unsub = null;
let status = '';          // short human-readable status line
let statusKind = '';      // '' | 'ok' | 'err'
let timer = null;
let syncing = false;
let again = false;
let pendingRender = false;

const app = () => window.wdwApp;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- UI (owned here; the app only inserts html() and calls mount-free delegation) ---------- */

function html() {
  if (!configured) return '';
  let inner;
  if (!user) {
    inner = `<div class="data-tools"><button type="button" data-sync-action="signin">Sign in with Google to sync</button></div>`;
  } else {
    inner = `<div class="sync-line">Syncing as ${esc(user.email || 'your account')}</div>
      <div class="data-tools">
        <button type="button" data-sync-action="syncnow">Sync now</button>
        <button type="button" data-sync-action="signout">Sign out</button>
      </div>`;
  }
  return `<div id="sync-box" style="margin-top:8px;">${inner}${status ? `<div class="data-status ${statusKind}">${esc(status)}</div>` : ''}</div>`;
}

function refreshBox() {
  const box = document.getElementById('sync-box');
  if (!box) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = html();
  box.replaceWith(tmp.firstElementChild);
}

function setStatus(text, kind = '') {
  status = text;
  statusKind = kind;
  refreshBox();
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest && ev.target.closest('[data-sync-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-sync-action');
  if (action === 'signin') signIn();
  else if (action === 'signout') signOut();
  else if (action === 'syncnow') syncNow();
});

/* ---------- Firebase ---------- */

async function load() {
  if (fb) return fb;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-auth.js'),
    import(FB + 'firebase-firestore.js'),
  ]);
  fb = { ...appMod, ...authMod, ...fsMod };
  const a = fb.initializeApp(firebaseConfig);
  auth = fb.getAuth(a);
  db = fb.getFirestore(a);
  return fb;
}

async function init() {
  if (!configured) return;
  try {
    await load();
  } catch (e) {
    // Offline or blocked: the app still works locally. We retry when the connection returns.
    setStatus('Sync unavailable offline. Your data is saved on this device.', '');
    return;
  }
  try { await fb.getRedirectResult(auth); } catch (e) { setStatus('Sign-in failed: ' + (e.code || e.message), 'err'); }
  fb.onAuthStateChanged(auth, (u) => {
    user = u;
    if (unsub) { unsub(); unsub = null; }
    if (u) {
      setStatus('Signed in. Syncing…', '');
      unsub = fb.onSnapshot(fb.doc(db, 'wdw', u.uid), (snap) => {
        // Ignore echoes of our own pending writes; react to real remote changes.
        if (snap.metadata.hasPendingWrites) return;
        scheduleSync(300);
      }, (e) => setStatus('Sync error: ' + (e.code || e.message), 'err'));
      scheduleSync(0);
    } else {
      setStatus('', '');
    }
    refreshBox();
  });
}

async function signIn() {
  try {
    await load();
  } catch (e) {
    setStatus('Can’t reach the sign-in service. Check your connection and try again.', 'err');
    return;
  }
  const provider = new fb.GoogleAuthProvider();
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (e) {
    const popupProblem = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'];
    if (popupProblem.includes(e.code)) {
      try { await fb.signInWithRedirect(auth, provider); return; } catch (e2) { e = e2; }
    }
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      setStatus('Sign-in failed: ' + (e.code || e.message), 'err');
    }
  }
}

async function signOut() {
  if (!fb) return;
  try { await fb.signOut(auth); } catch (e) {}
  try { localStorage.removeItem(BASE_KEY); } catch (e) {}
  setStatus('Signed out. Your data stays on this device.', 'ok');
}

/* ---------- Sync ---------- */

function readBase(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(BASE_KEY) || 'null');
    return raw && raw.uid === uid ? raw.state : null;
  } catch (e) { return null; }
}
function writeBase(uid, state) {
  try { localStorage.setItem(BASE_KEY, JSON.stringify({ uid, state })); } catch (e) {}
}

function scheduleSync(ms = 800) {
  if (!configured || !user) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

async function syncNow() {
  if (!configured || !user || !fb) return;
  if (syncing) { again = true; return; }
  if (navigator.onLine === false) { setStatus('Offline. Changes will sync when you’re back online.', ''); return; }
  syncing = true;
  const uid = user.uid;
  const ref = fb.doc(db, 'wdw', uid);
  try {
    let merged;
    await fb.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const remote = snap.exists() ? JSON.parse(snap.data().state) : { people: [], entries: [] };
      const local = app().getState();
      merged = mergeState(readBase(uid), local, remote);
      if (!snap.exists() || !statesEqual(merged, remote)) {
        tx.set(ref, { state: JSON.stringify(merged), updatedAt: fb.serverTimestamp() });
      }
    });
    writeBase(uid, merged);
    if (!statesEqual(merged, app().getState())) {
      app().applyRemote(merged);
      rerenderWhenIdle();
    }
    setStatus('Synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'ok');
  } catch (e) {
    if (navigator.onLine === false || ['unavailable', 'failed-precondition'].includes(e.code)) {
      setStatus('Offline. Changes will sync when you’re back online.', '');
    } else if (e.code === 'permission-denied') {
      setStatus('Sync blocked: the Firestore rules are not set up for this project.', 'err');
    } else {
      setStatus('Sync failed: ' + (e.code || e.message), 'err');
    }
  } finally {
    syncing = false;
    if (again) { again = false; scheduleSync(300); }
  }
}

// Don't rebuild the page under someone who is typing; wait until they leave the field.
function rerenderWhenIdle() {
  const a = document.activeElement;
  const typing = a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
  if (!typing) { app().render(); return; }
  if (pendingRender) return;
  pendingRender = true;
  const done = () => { pendingRender = false; document.removeEventListener('focusout', done, true); setTimeout(() => app().render(), 0); };
  document.addEventListener('focusout', done, true);
}

window.addEventListener('online', () => { if (!fb) init(); else scheduleSync(300); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(300); });

window.wdwSync = {
  html,
  localChanged: () => scheduleSync(800),
  configured,
};

// If the app rendered before this module loaded, add the sync controls now.
if (configured && app() && document.getElementById('app')) app().render();
init();
