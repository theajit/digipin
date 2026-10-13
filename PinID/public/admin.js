'use strict';
const $=id=>document.getElementById(id);let csrf='',before;
let invitationBefore;
async function invitations(append=false){
 const page=await api('/invitations/list','POST',invitationBefore?{before:invitationBefore}:{});if(!append)$('all-invitations').replaceChildren();
 for(const item of page.items){const card=document.createElement('section');card.className='card';const heading=document.createElement('h3');heading.textContent=item.name||'Administrator-issued invitation';card.append(heading);const dl=document.createElement('dl');for(const [label,value] of [['Invited by',item.inviter||'Administrator'],['Email',item.email||'Not collected'],['Phone',item.phone||'Not collected'],['Status',item.status],['Email',item.mail_status==='accepted'?'Accepted by Resend (delivery unconfirmed)':item.mail_status],['Expires',new Date(item.expires_at).toLocaleString()]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);}card.append(dl);$('all-invitations').append(card);}
 if(!append&&!page.items.length)$('all-invitations').textContent='No invitations issued yet.';invitationBefore=page.next_cursor;$('older-invitations').hidden=!invitationBefore;
}
async function api(path,method='GET',body){const response=await fetch('/api/admin'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-PinID-CSRF':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=response.status===204?null:await response.json();if(!response.ok){if(response.status===401)clear();throw new Error(response.status===429?'Too many requests. Please wait.':'Request failed. Check administrator access.');}return value;}
function clear(){csrf='';before=undefined;invitationBefore=undefined;$('all-invitations').replaceChildren();$('desk').hidden=true;$('login').hidden=false;$('queue').replaceChildren();$('invitation').textContent='';$('token').hidden=true;$('login').reset();$('admin-invite').reset();$('admin-invite').hidden=true;}
function token(value){if(!value)return;$('invitation').textContent=value.invitation;$('token').hidden=false;}
async function queue(append=false){
 const page=await api('/queue','POST',before===undefined?{}:{before});const rows=page.items;
 if(!append)$('queue').replaceChildren();
 if(!rows.length&&!append){const empty=document.createElement('p');empty.textContent='No invitation requests yet.';$('queue').append(empty);}
 for(const item of rows){
  const card=document.createElement('section');card.className='card';const heading=document.createElement('h3');heading.textContent=item.name;card.append(heading);
  const details=document.createElement('dl');for(const [label,value] of [['Phone',item.phone],['Email',item.email],['Wants',item.alias||'Chooses a name at registration'],['Invited by',item.inviter||'Public request'],['Status',item.status],['Type',item.kind==='extra_handle'?'Extra handle: ₹199/year':'Invitation'],['Team email',item.notification_status]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;details.append(dt,dd);}card.append(details);
  if(item.status==='pending')for(const decision of (item.kind==='extra_handle'?['reject']:['approve','reject'])){const button=document.createElement('button');button.type='button';button.textContent=decision==='approve'?'Approve & email invitation':'Decline request';button.addEventListener('click',()=>work(async()=>{button.disabled=true;try{token(await api('/requests/'+item.id,'POST',{decision}));before=undefined;await queue();}finally{button.disabled=false;}}));card.append(button);}
  const notify=document.createElement('button');notify.type='button';notify.className='secondary';notify.textContent='Email team notification';notify.addEventListener('click',()=>work(async()=>{notify.disabled=true;try{const result=await api('/requests/'+item.id+'/notify','POST',{});if(result.notification!=='accepted')throw new Error('Email could not be sent. The request remains saved.');}finally{notify.disabled=false;}}));card.append(notify);
  const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Delete request details';remove.addEventListener('click',()=>work(async()=>{if(!confirm('Delete this request and its contact details?'))return;await api('/requests/'+item.id,'DELETE',{});card.remove();}));card.append(remove);$('queue').append(card);
 }before=page.next_cursor??undefined;$('older').hidden=rows.length<50;if(!append){invitationBefore=undefined;await invitations();}
}
$('refresh-invitations').addEventListener('click',()=>work(async()=>{invitationBefore=undefined;await invitations();}));$('older-invitations').addEventListener('click',()=>work(()=>invitations(true)));
async function work(fn){try{await fn();$('message').textContent='';}catch(error){$('message').textContent=error.message;}}
$('login').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const credential=$('login').elements.credential.value;$('login').reset();const result=await api('/login','POST',{credential});csrf=result.csrf;$('login').hidden=true;$('desk').hidden=false;await queue();});});
$('invite').addEventListener('click',()=>{$('admin-invite').hidden=false;});$('hide-token').addEventListener('click',()=>{$('invitation').textContent='';$('token').hidden=true;});
$('admin-invite').querySelector('[type=submit]').disabled=false;
$('admin-invite').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const form=$('admin-invite');const result=await api('/invitations','POST',{name:form.elements.name.value,email:form.elements.email.value,phone:form.elements.phone.value,confirmed:form.elements.confirmed.checked});form.reset();form.hidden=true;token(result);await invitations();if(result.delivery!=='accepted')throw new Error('Invitation created, but email sending failed. The code is shown once for administrator recovery.');});});
$('refresh').addEventListener('click',()=>work(async()=>{before=undefined;await queue();}));$('older').addEventListener('click',()=>work(()=>queue(true)));
$('logout').addEventListener('click',()=>work(async()=>{await api('/logout','POST',{});clear();}));window.addEventListener('pagehide',clear);
$('login').querySelector('button').disabled=false;
api('/me').then(async value=>{csrf=value.csrf;$('login').hidden=true;$('desk').hidden=false;await queue();}).catch(clear);
