function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function toast(message, isError) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderColor = isError ? 'var(--danger)' : 'var(--border)';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function relativeTime(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function heartbeatHtml(license) {
  if (license.status !== 'active') {
    return `<span class="heartbeat"><span class="pulse down"></span> revoked</span>`;
  }
  if (!license.lastValidatedAt) {
    return `<span class="heartbeat"><span class="pulse stale"></span> not activated yet</span>`;
  }
  const diffMins = (Date.now() - new Date(license.lastValidatedAt).getTime()) / 60000;
  const cls = diffMins < 15 ? 'ok' : 'stale';
  return `<span class="heartbeat"><span class="pulse ${cls}"></span> validated ${relativeTime(license.lastValidatedAt)}</span>`;
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function openServerNameModal(license, onSaved) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="backdrop">
      <div class="modal">
        <h3>Rename server</h3>
        <p class="muted" style="font-size:0.85rem; margin-top:-6px;">This is just a label to help you tell your licenses apart.</p>
        <label for="server-name-input">Server name</label>
        <input id="server-name-input" type="text" maxlength="32" value="${escapeHtml(license.serverName || '')}" placeholder="e.g. Redwood RP">
        <div class="row" style="justify-content:flex-end; margin-top:18px;">
          <button class="btn" id="cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="save-btn">Save changes</button>
        </div>
      </div>
    </div>
  `;
  const close = () => (root.innerHTML = '');
  document.getElementById('backdrop').addEventListener('click', (e) => { if (e.target.id === 'backdrop') close(); });
  document.getElementById('cancel-btn').addEventListener('click', close);
  document.getElementById('save-btn').addEventListener('click', async () => {
    const value = document.getElementById('server-name-input').value;
    try {
      await api(`/api/licenses/${license.id}/server-name`, { method: 'POST', body: JSON.stringify({ serverName: value }) });
      toast('Server name saved.');
      close();
      onSaved();
    } catch (e) {
      toast(e.data && e.data.error === 'too_long' ? 'That name is too long (32 characters max).' : 'Could not save name.', true);
    }
  });
}

async function resetIp(license, onDone) {
  try {
    await api(`/api/licenses/${license.id}/reset-ip`, { method: 'POST' });
    toast('IP cleared. It will lock again next time the script starts.');
    onDone();
  } catch (e) {
    if (e.status === 429) {
      toast(`You can reset this again in about ${e.data.hoursLeft}h.`, true);
    } else {
      toast('Could not reset IP.', true);
    }
  }
}

async function downloadLicense(license) {
  try {
    const { url } = await api(`/api/licenses/${license.id}/download`);
    window.location = url;
  } catch (e) {
    toast('Download is not available for this license yet.', true);
  }
}

function licenseCardHtml(license) {
  const statusBadge = license.status === 'active'
    ? `<span class="badge badge-ok">Active</span>`
    : `<span class="badge badge-danger">Revoked</span>`;

  return `
    <div class="card" data-id="${license.id}">
      <div class="card-row" style="align-items:flex-start;">
        <div>
          <div class="row" style="margin-bottom:8px;">
            <h3 style="margin:0;">${escapeHtml(license.productName)}</h3>
            ${statusBadge}
          </div>
          <div class="stack" style="gap:4px; font-size:0.85rem;">
            <div class="row"><span class="faint" style="width:90px;">License key</span> <code>${escapeHtml(license.licenseKey)}</code></div>
            <div class="row"><span class="faint" style="width:90px;">Locked IP</span> <code>${license.ipLock ? escapeHtml(license.ipLock) : '—'}</code></div>
            <div class="row"><span class="faint" style="width:90px;">Server name</span> <span>${license.serverName ? escapeHtml(license.serverName) : '—'}</span></div>
          </div>
          <div style="margin-top:10px;">${heartbeatHtml(license)}</div>
        </div>
        <div class="stack" style="min-width:160px;">
          <button class="btn btn-primary btn-sm" data-action="download">Download</button>
          <button class="btn btn-sm" data-action="rename">Rename server</button>
          <button class="btn btn-sm btn-danger" data-action="reset-ip">Reset IP lock</button>
        </div>
      </div>
    </div>
  `;
}

async function loadLicenses() {
  const list = document.getElementById('license-list');
  const { licenses } = await api('/api/licenses');

  if (!licenses.length) {
    list.innerHTML = `<div class="card empty-state">No licenses on your account yet. Once you purchase a resource, it shows up here.</div>`;
    return;
  }

  list.innerHTML = licenses.map(licenseCardHtml).join('');

  list.querySelectorAll('[data-action]').forEach((btn) => {
    const card = btn.closest('[data-id]');
    const id = parseInt(card.dataset.id, 10);
    const license = licenses.find((l) => l.id === id);
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'download') downloadLicense(license);
      if (btn.dataset.action === 'rename') openServerNameModal(license, loadLicenses);
      if (btn.dataset.action === 'reset-ip') resetIp(license, loadLicenses);
    });
  });
}

async function main() {
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (cfg.siteName) { document.getElementById('site-name').textContent = cfg.siteName; document.title = `${cfg.siteName} · Dashboard`; }

  const me = await fetch('/auth/me').then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!me || !me.user) {
    window.location = '/auth/discord';
    return;
  }

  document.getElementById('auth-slot').innerHTML = `
    <img src="${me.user.avatar}" width="26" height="26" style="border-radius:50%" alt="">
    <span class="muted" style="margin-right:8px">${escapeHtml(me.user.username)}</span>
    <button class="btn btn-sm" id="logout-btn">Log out</button>
  `;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST' });
    window.location = '/';
  });

  if (me.user.isAdmin) document.getElementById('admin-link').style.display = 'block';

  loadLicenses();
  setInterval(loadLicenses, 30000); // keep heartbeat times fresh
}

main();
