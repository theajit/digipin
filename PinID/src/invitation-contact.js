'use strict';
const s=require('./security');
function contact(input){
 s.fields(input,['name','phone','email','confirmed'],['name','phone','email','confirmed']);
 if(input.confirmed!==true||typeof input.name!=='string'||!input.name.trim()||input.name.length>100||/[\x00-\x1f\x7f]/.test(input.name)||
 typeof input.email!=='string'||input.email.length>254||! /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(input.email)||
 typeof input.phone!=='string'||! /^[+0-9 ()-]{7,25}$/.test(input.phone)||input.phone.replace(/\D/g,'').length<7||input.phone.replace(/\D/g,'').length>15)throw new s.LiteError('INVALID_REQUEST');
 return {name:input.name.trim(),phone:input.phone.trim(),email:input.email.trim()};
}
module.exports={contact};
