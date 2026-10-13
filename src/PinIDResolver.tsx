import React, { useState } from 'react';
const endpoint = import.meta.env.VITE_PINID_ORIGIN || 'https://name.pincode.cafe';
type SharedPlace = { handle: string; digipin: string; latitude: number; longitude: number };
export function PinIDResolver() {
  const [handle,setHandle]=useState(''); const [result,setResult]=useState<SharedPlace|null>(null);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  async function resolve(event:React.FormEvent) {
    event.preventDefault();setResult(null);setError('');setBusy(true);
    try {
      const response=await fetch(`${endpoint}/api/resolve`,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle})});
      if(!response.ok)throw new Error(response.status===404?'This handle is unavailable or its owner has not enabled public sharing.':'Lookup unavailable. Please try later.');
      const value=await response.json();
      if(typeof value.handle!=='string'||! /^[23456789CJKLMPFT]{10}$/.test(value.digipin)||!Number.isFinite(value.latitude)||!Number.isFinite(value.longitude))throw new Error('Invalid lookup response.');
      setResult(value);
    }catch(problem){setError(problem instanceof Error?problem.message:'Lookup failed.');}finally{setBusy(false);}
  }
  return <section className="tool-panel pinid-resolver"><h2>Resolve a shared PinID</h2><p>Only locations explicitly made public by their owner can be found here. DIGIPIN does not verify residence or ownership.</p><form onSubmit={resolve}><label>Public handle<input value={handle} onChange={event=>setHandle(event.target.value)} placeholder="ajit@pincode" maxLength={38} required/></label><button className="primary" disabled={busy}>{busy?'Resolving…':'Resolve PinID'}</button></form><p role="status">{error}</p>{result&&<dl><dt>Handle</dt><dd>{result.handle}</dd><dt>DIGIPIN</dt><dd>{result.digipin}</dd><dt>Latitude</dt><dd>{result.latitude}</dd><dt>Longitude</dt><dd>{result.longitude}</dd></dl>}</section>;
}
