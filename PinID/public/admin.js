'use strict';
const $=id=>document.getElementById(id);let csrf='',before;
async function api(path,method='GET',body){const response=await fetch('/api/admin'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-PinID-CSRF':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=response.status===204?null:await response.json();if(!response.ok){if(response.status===401)clear();throw new Error(response.status===429?'Too many requests. Please wait.':'Request failed. Check administrator access.');}return value;}
function clear(){csrf='';before=undefined;$('desk').hidden=true;$('login').hidden=false;$('queue').replaceChildren();$('invitation').textContent='';$('token').hidden=true;$('login').reset();}
function token(value){if(!value)return;$('invitation').textContent=value.invitation;$('token').hidden=false;}
async function queue(append=false){
 const page=await api('/queue','POST',before===undefined?{}:{before});const rows=page.items;
 if(!append)$('queue').replaceChildren();
 if(!rows.length&&!append){const empty=document.createElement('p');empty.textContent='No invitation requests yet.';$('queue').append(empty);}
 for(const item of rows){
  const card=document.createElement('section');card.className='card';const heading=document.createElement('h3');heading.textContent=item.name;card.append(heading);
  const details=document.createElement('dl');for(const [label,value] of [['Phone',item.phone],['Email',item.email],['Wants',item.alias],['Status',item.status]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;details.append(dt,dd);}card.append(details);
  if(item.status==='pending')for(const decision of ['approve','reject']){const button=document.createElement('button');button.type='button';button.textContent=decision==='approve'?'Approve & create invitation':'Decline request';button.addEventListener('click',()=>work(async()=>{button.disabled=true;try{token(await api('/requests/'+item.id,'POST',{decision}));before=undefined;await queue();}finally{button.disabled=false;}}));card.append(button);}
  const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Delete request details';remove.addEventListener('click',()=>work(async()=>{if(!confirm('Delete this request and its contact details?'))return;await api('/requests/'+item.id,'DELETE',{});card.remove();}));card.append(remove);$('queue').append(card);
 }before=page.next_cursor??undefined;$('older').hidden=rows.length<50;
}
async function work(fn){try{await fn();$('message').textContent='';}catch(error){$('message').textContent=error.message;}}
$('login').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const credential=$('login').elements.credential.value;$('login').reset();const result=await api('/login','POST',{credential});csrf=result.csrf;$('login').hidden=true;$('desk').hidden=false;await queue();});});
$('invite').addEventListener('click',()=>work(async()=>token(await api('/invitations','POST',{}))));$('hide-token').addEventListener('click',()=>{$('invitation').textContent='';$('token').hidden=true;});
$('refresh').addEventListener('click',()=>work(async()=>{before=undefined;await queue();}));$('older').addEventListener('click',()=>work(()=>queue(true)));
$('logout').addEventListener('click',()=>work(async()=>{await api('/logout','POST',{});clear();}));window.addEventListener('pagehide',clear);
$('login').querySelector('button').disabled=false;
api('/me').then(async value=>{csrf=value.csrf;$('login').hidden=true;$('desk').hidden=false;await queue();}).catch(clear);
