'use strict';
const $ = id => document.getElementById(id);
let csrf = ''; let profile = null;
function task(name, focus = false) {
  if (focus) message('');
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
  for (const button of document.querySelectorAll('[data-task]')) { const selected = button.dataset.task === name; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
  if (focus) document.querySelector(`[data-panel="${name}"] h2`)?.focus();
}
for (const button of document.querySelectorAll('[data-task]')) {
  button.addEventListener('click', () => task(button.dataset.task, true));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const buttons = [...document.querySelectorAll('[data-task]')].filter(item => !item.hidden);
    const index = buttons.indexOf(button); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    task(buttons[next].dataset.task); buttons[next].focus();
  });
}
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-PinID-CSRF': csrf } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const value = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const messages = { ENROLLMENT_FAILED: 'The invitation or username could not be accepted. Check your invitation and try another username.',
      RECOVERY_FAILED: 'That sign-in key could not be accepted. Check the full key and try again.', RATE_LIMITED: 'Too many attempts. Wait ten minutes before trying again.',
      INVALID_DIGIPIN: 'Enter all 10 DIGIPIN characters. Spaces and dashes are okay.', NOT_FOUND: 'This PinID is unavailable or its owner has kept it private.',
      INVITE_LIMIT_REACHED: 'You have already used your one-person invitation allowance.',
      EMAIL_NOT_CONFIGURED: 'Email sending is not ready yet. Please contact the administrator.', INVITATION_UNAVAILABLE: 'This invitation cannot be resent. It may have been redeemed or removed.',
      INVALID_ALIAS: 'Use 3–30 letters, numbers, underscores or hyphens. This name may be reserved.',
      UNAUTHORIZED: 'Your session has ended. Use your recovery credential to return.',
      CONFIRMATION_REQUIRED: 'Confirm the selected coordinates before saving.', INVALID_COORDINATES: 'Enter valid coordinates within the DIGIPIN bounds.' };
    throw new Error(messages[value?.error?.code] || 'The request could not be completed. Please try again.');
  }
  return value;
}
function clear() {
  $('extra-handle').reset();$('resend-person').hidden=true;
  $('invite-person').reset();$('invite-person-fields').disabled=true;$('owner-invite-status').textContent='';
  $('interest').reset();$('resolve').reset();$('resolved').replaceChildren();$('sharing').reset();
  profile = null; csrf = ''; $('dashboard').hidden = true; $('access').hidden = false;
  $('recovery-once').hidden = true; $('new-credential').textContent = ''; $('alias').textContent = '';
  $('saved-location').replaceChildren(); $('edit').reset(); $('delete-user').reset();
  $('enroll').reset(); $('recover').reset();
  for (const form of [$('enroll'), $('edit')]) { form.dataset.source = 'manual'; updatePreview(form); }
  $('tab-dashboard').hidden = true; $('tab-create').hidden = false; $('tab-signin').hidden = false; task('find');
}
function show(value) {
  profile = value; csrf = value.csrf || csrf; $('access').hidden = true; $('dashboard').hidden = false;
  $('alias').textContent = value.alias; const record = value.location; $('saved-location').replaceChildren();
  for (const [label, data] of record ? [['Label', record.label], ['DIGIPIN', record.digipin], ['Latitude', record.latitude], ['Longitude', record.longitude], ['Address / notes', record.address || '—']] : [['Location', 'No saved location']]) {
    const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = String(data); $('saved-location').append(dt, dd);
  }
  $('delete-location').hidden = !record;
  $('tab-dashboard').hidden = false; $('tab-create').hidden = true; $('tab-signin').hidden = true; task('dashboard');
  $('invite-person-fields').disabled=true;
  api('/my-invitation').then(status=>{if(profile?.id!==value.id)return;$('invite-person-fields').disabled=status.used||!status.email_enabled;$('resend-person').hidden=!status.used||!status.email_enabled||['redeemed','removed'].includes(status.status);$('owner-invite-status').textContent=status.used?`Your invitation allowance is used. Status: ${status.status==='approved'?'issued':status.status}. Email: ${status.delivery==='accepted'?'accepted by Resend (delivery unconfirmed)':status.delivery||'not sent'}.`:status.email_enabled?'Your one-person invitation is available.':'Email sending is not ready. You can invite someone once the administrator configures Resend.';}).catch(()=>{$('owner-invite-status').textContent='We could not check your invitation allowance. Please refresh.';});
  api('/sharing').then(status=>{if(profile?.id!==value.id)return;$('sharing').elements.enabled.checked=status.enabled;$('sharing').elements.confirmed.checked=false;$('sharing-status').textContent=status.enabled?'Public: anyone can find these coordinates.':'Private: only you can see this place.';$('stop-sharing').hidden=!status.enabled;}).catch(()=>message('We could not check your sharing setting. Try refreshing.',true));
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
  form.querySelector('.decode-location').addEventListener('click', async event => {
    const button = event.currentTarget; const code = form.elements.coordinate_code.value; button.disabled = true;
    try { const value = await api('/tools/decode', 'POST', {digipin: code});
      if (form.elements.coordinate_code.value !== code) throw new Error('The DIGIPIN changed. Press the button again.');
      form.elements.latitude.value = value.latitude; form.elements.longitude.value = value.longitude;
      form.dataset.source = 'manual'; form.elements.confirmed.checked = false; updatePreview(form);
      form.querySelector('.preview').textContent += ' This is the centre of the DIGIPIN map square.';
    } catch (error) { form.querySelector('.preview').textContent = error.message; } finally { button.disabled = false; }
  });
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
    const status = form.querySelector('.form-status'); if (status) { status.textContent = 'Please wait…'; status.classList.remove('error'); }
    try { const result=await work(); if (status) status.textContent = result||'Done.'; } catch (error) { if (status) {status.textContent = error.message; status.classList.add('error');} message(error.message, true); } finally { button.disabled = false; }
  });
}
submit($('enroll'), async () => {
  const form = $('enroll'); const value = await api('/enroll', 'POST', { invitation: form.elements.invitation.value, username: form.elements.username.value, location: locationInput(form) });
  form.reset(); show(value); $('new-credential').textContent = value.recovery_credential; delete value.recovery_credential;
  $('recovery-once').hidden = false; message('Your private identity is ready. Save the credential now.');
  $('recovery-once').querySelector('h2').focus();
});
 $('copy-credential').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('new-credential').textContent); message('Key copied. Save it somewhere safe before leaving.'); } catch { message('Copy is unavailable. Select the key and copy it yourself.', true); } });
 $('stop-sharing').addEventListener('click', async () => { try {await api('/sharing','PUT',{enabled:false,confirmed:false});show(await api('/me'));message('Your place is private. New public lookups are stopped.');}catch(error){message(error.message,true);} });
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

submit($('interest'),async()=>{const form=$('interest');await api('/interest','POST',{name:form.elements.name.value,phone:form.elements.phone.value,email:form.elements.email.value,username:form.elements.username.value,confirmed:form.elements.confirmed.checked});form.reset();message('Request received. The administrator will review it; your username is not reserved.');});
submit($('invite-person'),async()=>{const form=$('invite-person');const value=await api('/my-invitation','POST',{name:form.elements.name.value,email:form.elements.email.value,phone:form.elements.phone.value,confirmed:form.elements.confirmed.checked});form.reset();show(await api('/me'));const feedback=value.delivery==='accepted'?'Invitation issued. Resend accepted the recipient email; delivery is not yet confirmed. Your one-person allowance is used.':'Invitation issued, but the email could not be sent. Use “Resend invitation” to try a new code.';message(feedback);return feedback;});
$('resend-person').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const value=await api('/my-invitation/resend','POST',{});message(value.delivery==='accepted'?'A new code was accepted by Resend. The old code no longer works.':'A new code was created, but email sending failed. You can retry. The old code no longer works.');}catch(error){message(error.message,true);}finally{button.disabled=false;}});
submit($('extra-handle'),async()=>{const form=$('extra-handle');const value=await api('/handle-requests','POST',{name:form.elements.name.value,email:form.elements.email.value,phone:form.elements.phone.value,username:form.elements.username.value,confirmed:form.elements.confirmed.checked});form.reset();const feedback=value.notification==='accepted'?'Request saved. Resend accepted the email to the team. No handle is reserved and no payment has been taken.':'Request saved, but the email failed. The administrator can see your request in the queue.';message(feedback);return feedback;});
submit($('resolve'),async()=>{$('resolved').replaceChildren();const input=$('resolve').elements.handle.value.trim();const isHandle=input.toLowerCase().endsWith('@pincode');const value=await api(isHandle?'/resolve':'/tools/decode','POST',isHandle?{handle:input}:{digipin:input});for(const [key,label] of [['handle','PinID'],['digipin','DIGIPIN'],['latitude','Latitude'],['longitude','Longitude']]){if(value[key]===undefined)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value[key]);$('resolved').append(dt,dd);}message(isHandle?'This owner has chosen to share this place.':'This is the centre of the DIGIPIN map square.');});
submit($('sharing'),async()=>{const form=$('sharing');await api('/sharing','PUT',{enabled:form.elements.enabled.checked,confirmed:form.elements.confirmed.checked});show(await api('/me'));message('Sharing preference saved. Revocation prevents future lookup; existing copies cannot be recalled.');});
for(const button of document.querySelectorAll('button[type="submit"]'))button.disabled=false;
