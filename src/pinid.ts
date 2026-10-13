type SharedPlace = { handle: string; digipin: string; latitude: number; longitude: number };
export async function resolvePinID(handle:string):Promise<SharedPlace> {
  const endpoint=import.meta.env.VITE_PINID_ORIGIN||'https://name.pincode.cafe';
  const response=await fetch(`${endpoint}/api/resolve`,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:handle.trim()})});
  if(!response.ok)throw new Error(response.status===404?'This handle is unavailable or its owner has not enabled public sharing.':'Lookup unavailable. Please try later.');
  const value=await response.json();
  if(typeof value.handle!=='string'||! /^[23456789CJKLMPFT]{10}$/.test(value.digipin)||!Number.isFinite(value.latitude)||!Number.isFinite(value.longitude)||value.latitude<2.5||value.latitude>38.5||value.longitude<63.5||value.longitude>99.5)throw new Error('Invalid lookup response.');
  return {handle:value.handle,digipin:value.digipin,latitude:value.latitude,longitude:value.longitude};
}
