'use strict';

// ============================================================
//  Inloggen en gebruikers
//  Alleen als de app via de server draait. Iedere gebruiker
//  heeft een eigen kelder; de admin ziet ook de pagina
//  "Gebruikers" om accounts te beheren.
// ============================================================

const ROLE_LABELS = { admin: 'Admin', user: 'Gebruiker' };

let currentUser = null;
let users = [];
let editingUserId = null;

const Auth = {
  session() { return api('api/session'); },
  setup(username, password) { return apiSend('POST', 'api/setup', { username, password }); },
  login(username, password) { return apiSend('POST', 'api/login', { username, password }); },
  logout() { return apiSend('POST', 'api/logout'); },
  changePassword(current, password) { return apiSend('POST', 'api/password', { current, password }); },
  listUsers() { return api('api/users'); },
  createUser(user) { return apiSend('POST', 'api/users', user); },
  updateUser(id, changes) { return apiSend('PUT', `api/users/${id}`, changes); },
  deleteUser(id) { return api(`api/users/${id}`, { method: 'DELETE' }); },
};

// ---------- Inlogscherm ----------

// mode is 'setup' (eerste admin aanmaken) of 'login'
function showAuthScreen(mode, { legacy = false, message = '' } = {}) {
  document.body.classList.add('logged-out');
  $$('dialog[open]').forEach(d => d.close());
  const form = $('#form-auth');
  const setup = mode === 'setup';
  form.dataset.mode = mode;
  form.reset();
  $('#auth-title').textContent = setup ? 'Welkom! Maak een admin-account aan' : 'Inloggen';
  $('#auth-intro').textContent = setup
    ? 'Met dit account beheer je de app en kun je andere gebruikers toevoegen.' +
      (legacy ? ' Je bestaande kelder wordt aan dit account gekoppeld.' : '')
    : message;
  $('#auth-intro').hidden = !$('#auth-intro').textContent;
  $('#auth-repeat').hidden = !setup;
  form.elements.repeat.required = setup;
  form.elements.password.autocomplete = setup ? 'new-password' : 'current-password';
  form.querySelector('button[type=submit]').textContent = setup ? 'Account aanmaken' : 'Inloggen';
  $('#auth-error').textContent = '';
  form.elements.username.focus();
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const f = form.elements;
  const setup = form.dataset.mode === 'setup';
  if (setup && f.password.value !== f.repeat.value) {
    $('#auth-error').textContent = 'De twee wachtwoorden zijn niet gelijk.';
    return;
  }
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    if (setup) await Auth.setup(f.username.value, f.password.value);
    else await Auth.login(f.username.value, f.password.value);
    // Opnieuw laden, zodat er niets van een vorige gebruiker in het geheugen blijft
    location.reload();
  } catch (err) {
    $('#auth-error').textContent = err.message;
    button.disabled = false;
  }
}

async function logout() {
  try {
    await Auth.logout();
  } catch {
    // Ook als de server niet reageert: opnieuw laden toont het inlogscherm of de fout
  }
  location.reload();
}

// Toont wie er is ingelogd, en de pagina Gebruikers alleen voor een admin
function showUser(user) {
  currentUser = user;
  $('#account').hidden = false;
  $('#account-name').textContent = user.username;
  $('#tab-btn-gebruikers').hidden = user.role !== 'admin';
}

// ---------- Eigen wachtwoord ----------

function openPasswordForm() {
  $('#form-password').reset();
  $('#password-error').textContent = '';
  $('#dlg-password').showModal();
}

async function onPasswordSubmit(e) {
  e.preventDefault();
  const f = e.target.elements;
  if (f.password.value !== f.repeat.value) {
    $('#password-error').textContent = 'De twee nieuwe wachtwoorden zijn niet gelijk.';
    return;
  }
  try {
    await Auth.changePassword(f.current.value, f.password.value);
    $('#dlg-password').close();
    alert('Je wachtwoord is gewijzigd. Op je andere apparaten moet je opnieuw inloggen.');
  } catch (err) {
    $('#password-error').textContent = err.message;
  }
}

// ---------- Gebruikers (alleen admin) ----------

async function loadUsers() {
  try {
    users = (await Auth.listUsers()).users;
  } catch (err) {
    $('#user-list').innerHTML = `<p class="error">Kon de gebruikers niet ophalen: ${esc(err.message)}</p>`;
    return;
  }
  renderUsers();
}

function renderUsers() {
  $('#user-list').innerHTML = `
    <div class="table-wrap"><table class="table users-table">
      <thead><tr><th>Gebruikersnaam</th><th>Rol</th><th>Sinds</th><th></th></tr></thead>
      <tbody>${users.map(u => `
        <tr>
          <td>${esc(u.username)}${u.id === currentUser.id ? ' <small class="muted">(jij)</small>' : ''}</td>
          <td>${ROLE_LABELS[u.role] || esc(u.role)}</td>
          <td>${esc(new Date(u.created).toLocaleDateString('nl-NL'))}</td>
          <td class="actions">
            <button data-action="edit-user" data-id="${u.id}">Bewerken</button>
            ${u.id === currentUser.id ? '' : `<button class="danger" data-action="delete-user" data-id="${u.id}">Verwijderen</button>`}
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="muted small">Iedere gebruiker heeft een eigen kelder en ziet alleen de eigen wijnen.
      Een admin kan daarnaast gebruikers beheren.</p>`;
}

function openUserForm(user = null) {
  editingUserId = user?.id ?? null;
  const form = $('#form-user');
  const f = form.elements;
  form.reset();
  $('#user-form-title').textContent = user ? `Gebruiker ${user.username} bewerken` : 'Gebruiker toevoegen';
  f.username.value = user?.username ?? '';
  f.username.readOnly = !!user;
  f.role.value = user?.role ?? 'user';
  f.password.required = !user;
  f.password.placeholder = user ? 'leeg laten = niet wijzigen' : 'minstens 8 tekens';
  $('#user-password-label').firstChild.textContent = user ? 'Nieuw wachtwoord' : 'Wachtwoord *';
  $('#user-error').textContent = '';
  $('#dlg-user').showModal();
}

async function onUserSubmit(e) {
  e.preventDefault();
  const f = e.target.elements;
  try {
    if (editingUserId) {
      const changes = { role: f.role.value };
      if (f.password.value) changes.password = f.password.value;
      await Auth.updateUser(editingUserId, changes);
      // Jezelf geen admin meer gemaakt? Dan verdwijnt deze pagina
      if (editingUserId === currentUser.id && f.role.value !== 'admin') return location.reload();
    } else {
      await Auth.createUser({ username: f.username.value, password: f.password.value, role: f.role.value });
    }
    $('#dlg-user').close();
    await loadUsers();
  } catch (err) {
    $('#user-error').textContent = err.message;
  }
}

async function deleteUser(id) {
  const user = users.find(u => u.id === id);
  if (!user) return;
  if (!confirm(`Gebruiker "${user.username}" verwijderen? Deze gebruiker kan daarna niet meer inloggen.\n\n` +
               'De kelder wordt niet gewist, maar op de server apart gezet in de map "verwijderd".')) return;
  try {
    await Auth.deleteUser(id);
    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
}
