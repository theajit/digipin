'use strict';
const $ = id => document.getElementById(id);
let csrf = ''; let profile = null;
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-PinID-CSRF': csrf } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const value = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const messages = { ENROLLMENT_FAILED: 'The invitation or username could not be accepted. Check your invitation and try another username.',
      RECOVERY_FAILED: 'That recovery credential could not be accepted.', RATE_LIMITED: 'Too many attempts. Wait ten minutes before trying again.',
      INVALID_ALIAS: 'Use 3–30 letters, numbers, underscores or hyphens. This name may be reserved.',
      UNAUTHORIZED: 'Your session has ended. Use your recovery credential to return.',
      CONFIRMATION_REQUIRED: 'Confirm the selected coordinates before saving.', INVALID_COORDINATES: 'Enter valid coordinates within the DIGIPIN bounds.' };
    throw new Error(messages[value?.error?.code] || 'The request could not be completed. Please try again.');
  }
  return value;
}
function clear() {
  profile = null; csrf = ''; $('dashboard').hidden = true; $('access').hidden = false;
  $('recovery-once').hidden = true; $('new-credential').textContent = ''; $('alias').textContent = '';
  $('saved-location').replaceChildren(); $('edit').reset(); $('delete-user').reset();
  $('enroll').reset(); $('recover').reset();
  for (const form of [$('enroll'), $('edit')]) { form.dataset.source = 'manual'; updatePreview(form); }
}
function show(value) {
  profile = value; csrf = value.csrf || csrf; $('access').hidden = true; $('dashboard').hidden = false;
  $('alias').textContent = value.alias; const record = value.location; $('saved-location').replaceChildren();
  for (const [label, data] of record ? [['Label', record.label], ['DIGIPIN', record.digipin], ['Latitude', record.latitude], ['Longitude', record.longitude], ['Address / notes', record.address || '—']] : [['Location', 'No saved location']]) {
    const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = String(data); $('saved-location').append(dt, dd);
  }
  $('delete-location').hidden = !record;
  for (const name of ['label', 'latitude', 'longitude', 'address']) $('edit').elements[name].value = record?.[name] ?? (name === 'label' ? 'Home' : '');
  $('edit').elements.confirmed.checked = false; updatePreview($('edit'));
}
function locationInput(form) {
  return { label: form.elements.label.value, latitude: Number(form.elements.latitude.value), longitude: Number(form.elements.longitude.value),
    address: form.elements.address.value, confirmed: form.elements.confirmed.checked, source: form.dataset.source || 'manual' };
}
function updatePreview(form) {
  form.querySelector('.preview').textContent = `Selected coordinates: ${form.elements.latitude.value || '—'}, ${form.elements.longitude.value || '—'}. Confirm these before saving.`;
}
for (const form of [$('enroll'), $('edit')]) {
  form.querySelector('.location-editor').addEventListener('input', event => {
    if (event.target.name !== 'confirmed') { form.elements.confirmed.checked = false; updatePreview(form); }
    if (['latitude', 'longitude'].includes(event.target.name)) form.dataset.source = 'manual';
  });
  form.querySelector('.gps').addEventListener('click', () => {
    if (!navigator.geolocation) return message('Geolocation is unavailable. Enter coordinates manually.', true);
    message('Requesting your current location…');
    navigator.geolocation.getCurrentPosition(position => {
      form.elements.latitude.value = position.coords.latitude; form.elements.longitude.value = position.coords.longitude;
      form.dataset.source = 'gps'; form.elements.confirmed.checked = false; updatePreview(form);
      message(`Location selected (reported accuracy ${Math.round(position.coords.accuracy)} m). Review and confirm it.`);
    }, () => message('Location access was unavailable. You can enter coordinates manually.', true), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  });
}
function submit(form, work) {
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { await work(); } catch (error) { message(error.message, true); } finally { button.disabled = false; }
  });
}
submit($('enroll'), async () => {
  const form = $('enroll'); const value = await api('/enroll', 'POST', { invitation: form.elements.invitation.value, username: form.elements.username.value, location: locationInput(form) });
  form.reset(); show(value); $('new-credential').textContent = value.recovery_credential; delete value.recovery_credential;
  $('recovery-once').hidden = false; message('Your private identity is ready. Save the credential now.');
});
submit($('recover'), async () => { const value = await api('/recover', 'POST', { credential: $('recover').elements.credential.value }); $('recover').reset(); show(value); message('Your private dashboard is open.'); });
submit($('edit'), async () => { await api('/location', 'PUT', locationInput($('edit'))); show(await api('/me')); message('Location saved privately.'); });
submit($('delete-user'), async () => { if (!confirm('Delete this identity and its live location?')) return; await api('/me', 'DELETE', { credential: $('delete-user').elements.credential.value }); clear(); message('Identity deleted. Sessions and recovery access revoked.'); });
$('saved-credential').addEventListener('click', () => { $('new-credential').textContent = ''; $('recovery-once').hidden = true; message('Your recovery credential is saved. Your location stays private.'); });
$('logout').addEventListener('click', async () => { try { await api('/logout', 'POST', {}); clear(); message('Signed out.'); } catch (error) { message(error.message, true); } });
$('delete-location').addEventListener('click', async () => { if (!confirm('Delete this saved location?')) return; try { await api(`/locations/${profile.location.id}`, 'DELETE', {}); show(await api('/me')); message('Location deleted.'); } catch (error) { message(error.message, true); } });
$('export').addEventListener('click', async () => {
  try { const data = await api('/me/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'pinid-export.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  catch (error) { message(error.message, true); }
});
// Never retain private DOM values through a browser history snapshot.
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', () => { api('/me').then(show).catch(() => clear()); });
for (const button of document.querySelectorAll('button[type="submit"]')) button.disabled = false;
