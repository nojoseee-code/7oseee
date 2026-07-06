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

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

function showModal(title, bodyHtml, onSave, saveLabel) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="backdrop">
      <div class="modal">
        <h3>${title}</h3>
        ${bodyHtml}
        <div class="row" style="justify-content:flex-end; margin-top:18px;">
          <button class="btn" id="cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="save-btn">${saveLabel || 'Save'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('backdrop').addEventListener('click', (e) => { if (e.target.id === 'backdrop') closeModal(); });
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('save-btn').addEventListener('click', onSave);
}

// ---------------- Products ----------------

async function loadProducts() {
  const { products } = await api('/api/admin/products');
  const tbody = document.querySelector('#products-table tbody');
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center; padding:28px;">No products yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr data-id="${p.id}">
      <td>${escapeHtml(p.name)}</td>
      <td class="mono faint">${escapeHtml(p.slug)}</td>
      <td class="mono">${p.price ? '$' + p.price : 'Free'}</td>
      <td class="mono">${escapeHtml(p.version || '1.0.0')}</td>
      <td class="mono faint">${p.fileName ? escapeHtml(p.fileName) : '<em>not set</em>'}</td>
      <td><button class="btn btn-sm btn-danger" data-action="delete-product">Delete</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="delete-product"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('tr').dataset.id;
      if (!confirm('Delete this product? Existing licenses for it will keep working but show "(deleted product)".')) return;
      await api(`/api/admin/products/${id}`, { method: 'DELETE' });
      loadProducts();
    });
  });
}

function openNewProductModal() {
  showModal('New product', `
    <div class="stack" style="gap:12px;">
      <div><label>Name</label><input id="p-name" type="text" placeholder="Melox Anti-Cheat"></div>
      <div><label>Slug (URL-safe id)</label><input id="p-slug" type="text" placeholder="anti-cheat"></div>
      <div><label>Description</label><input id="p-desc" type="text" placeholder="Short description shown on the store page"></div>
      <div class="row">
        <div style="flex:1"><label>Price (USD)</label><input id="p-price" type="number" min="0" placeholder="25"></div>
        <div style="flex:1"><label>Version</label><input id="p-version" type="text" placeholder="1.0.0"></div>
      </div>
      <div><label>File name in /resources</label><input id="p-file" type="text" placeholder="anti-cheat_obfuscated.lua"></div>
    </div>
  `, async () => {
    const body = {
      name: document.getElementById('p-name').value.trim(),
      slug: document.getElementById('p-slug').value.trim(),
      description: document.getElementById('p-desc').value.trim(),
      price: parseFloat(document.getElementById('p-price').value) || 0,
      version: document.getElementById('p-version').value.trim() || '1.0.0',
      fileName: document.getElementById('p-file').value.trim() || null,
    };
    if (!body.name || !body.slug) return toast('Name and slug are required.', true);
    try {
      await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      toast('Product created.');
      loadProducts();
    } catch (e) {
      toast('Could not create product.', true);
    }
  }, 'Create product');
}

// ---------------- Licenses ----------------

async function loadLicenses() {
  const { licenses } = await api('/api/admin/licenses');
  const tbody = document.querySelector('#licenses-table tbody');
  if (!licenses.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center; padding:28px;">No licenses issued yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = licenses.map(l => `
    <tr data-id="${l.id}">
      <td>${escapeHtml(l.productName)}</td>
      <td class="mono faint">${escapeHtml(l.discordUserId)}</td>
      <td class="mono">${escapeHtml(l.licenseKey)}</td>
      <td class="mono faint">${l.ipLock ? escapeHtml(l.ipLock) : '—'}</td>
      <td>${l.status === 'active' ? '<span class="badge badge-ok">Active</span>' : '<span class="badge badge-danger">Revoked</span>'}</td>
      <td class="row">
        <button class="btn btn-sm" data-action="toggle-status">${l.status === 'active' ? 'Revoke' : 'Reactivate'}</button>
        <button class="btn btn-sm btn-danger" data-action="delete-license">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="toggle-status"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      const license = licenses.find((l) => String(l.id) === id);
      const newStatus = license.status === 'active' ? 'revoked' : 'active';
      await api(`/api/admin/licenses/${id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      loadLicenses();
    });
  });
  tbody.querySelectorAll('[data-action="delete-license"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Permanently delete this license?')) return;
      const id = btn.closest('tr').dataset.id;
      await api(`/api/admin/licenses/${id}`, { method: 'DELETE' });
      loadLicenses();
    });
  });
}

async function openNewLicenseModal() {
  const { products } = await api('/api/admin/products');
  const options = products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  showModal('Issue license', `
    <div class="stack" style="gap:12px;">
      <div><label>Product</label><select id="l-product">${options || '<option disabled>No products yet</option>'}</select></div>
      <div><label>Discord user ID (the buyer)</label><input id="l-discord" type="text" placeholder="123456789012345678"></div>
    </div>
  `, async () => {
    const productId = parseInt(document.getElementById('l-product').value, 10);
    const discordUserId = document.getElementById('l-discord').value.trim();
    if (!productId || !discordUserId) return toast('Pick a product and enter a Discord ID.', true);
    try {
      await api('/api/admin/licenses', { method: 'POST', body: JSON.stringify({ productId, discordUserId }) });
      closeModal();
      toast('License issued.');
      loadLicenses();
    } catch (e) {
      toast('Could not issue license.', true);
    }
  }, 'Issue license');
}

// ---------------- Tabs & boot ----------------

function setupTabs() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      const tab = link.dataset.tab;
      document.getElementById('tab-products').style.display = tab === 'products' ? 'block' : 'none';
      document.getElementById('tab-licenses').style.display = tab === 'licenses' ? 'block' : 'none';
      if (tab === 'licenses') loadLicenses();
    });
  });
}

async function main() {
  const me = await fetch('/auth/me').then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!me || !me.user) { window.location = '/auth/discord'; return; }

  if (!me.user.isAdmin) {
    document.getElementById('guard').style.display = 'block';
    document.getElementById('panel-content').style.display = 'none';
    document.querySelector('.sidenav').style.display = 'none';
    return;
  }

  document.getElementById('auth-slot').innerHTML = `
    <img src="${me.user.avatar}" width="26" height="26" style="border-radius:50%" alt="">
    <span class="muted">${escapeHtml(me.user.username)}</span>
  `;

  setupTabs();
  document.getElementById('new-product-btn').addEventListener('click', openNewProductModal);
  document.getElementById('new-license-btn').addEventListener('click', openNewLicenseModal);
  loadProducts();
}

main();
