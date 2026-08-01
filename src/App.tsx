import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Clipboard, Compass, ExternalLink, Grid2X2, HelpCircle, LocateFixed, Map, MapPin, RefreshCw, Search, Share2 } from 'lucide-react';
import { OpenLocationCode } from 'open-location-code';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');
const ALPHABET = /^[23456789CJKLMPFT]{10}$/;
type Mode = 'encode' | 'decode' | 'pluscode';
type Result = { digipin: string; latitude: string; longitude: string };
const plusCodeCodec = new OpenLocationCode();

const formatCode = (code: string) => code.length === 10 ? `${code.slice(0, 3)} ${code.slice(3, 7)} ${code.slice(7)}` : code;

export function App() {
  const [mode, setMode] = useState<Mode>('encode');
  const [latitude, setLatitude] = useState('13.067526');
  const [longitude, setLongitude] = useState('80.270956');
  const [digipin, setDigipin] = useState('');
  const [plusCode, setPlusCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const validCoords = useMemo(() => {
    const lat = Number(latitude), lng = Number(longitude);
    return latitude !== '' && longitude !== '' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= 2.5 && lat <= 38.5 && lng >= 63.5 && lng <= 99.5;
  }, [latitude, longitude]);
  const validCode = ALPHABET.test(digipin);
  const plusCodeInput = plusCode.trim().toUpperCase();
  const [plusCodePart = '', ...localityParts] = plusCodeInput.split(/[\s,]+/);
  const plusCodeLocality = localityParts.join(' ').trim();
  const validPlusCode = (plusCodeCodec.isFull(plusCodePart) && plusCodeCodec.isValid(plusCodePart)) || (plusCodeCodec.isShort(plusCodePart) && plusCodeLocality.length > 1);

  const saveResult = (next: Result) => {
    setResult(next);
    setHistory(current => [next, ...current.filter(item => item.digipin !== next.digipin)].slice(0, 3));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      let endpoint = mode === 'decode' ? 'decode' : 'encode';
      let body: { latitude: number; longitude: number } | { digipin: string };
      let plusCoordinates: { latitude: string; longitude: string } | null = null;
      if (mode === 'pluscode') {
        let fullPlusCode = plusCodePart;
        if (plusCodeCodec.isShort(plusCodePart)) {
          if (!plusCodeLocality) throw new Error('Add the locality after the short Plus Code, for example JJFH+MG Dhenkanal.');
          const localityResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(plusCodeLocality)}`, { headers: { 'Accept-Language': 'en' } });
          if (!localityResponse.ok) throw new Error('The locality lookup service is unavailable. Try a full Plus Code.');
          const places = await localityResponse.json();
          if (!Array.isArray(places) || places.length === 0) throw new Error('Locality not found. Add the district or state, or use a full Plus Code.');
          fullPlusCode = plusCodeCodec.recoverNearest(plusCodePart, Number(places[0].lat), Number(places[0].lon));
        }
        const area = plusCodeCodec.decode(fullPlusCode);
        const decodedLatitude = area.latitudeCenter;
        const decodedLongitude = area.longitudeCenter;
        if (decodedLatitude < 2.5 || decodedLatitude > 38.5 || decodedLongitude < 63.5 || decodedLongitude > 99.5) throw new Error('This Plus Code is outside the supported DIGIPIN grid.');
        plusCoordinates = { latitude: decodedLatitude.toFixed(6), longitude: decodedLongitude.toFixed(6) };
        body = { latitude: decodedLatitude, longitude: decodedLongitude };
      } else {
        body = mode === 'encode' ? { latitude: Number(latitude), longitude: Number(longitude) } : { digipin };
      }
      const response = await fetch(`${API_BASE}/digipin/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
      const next = mode !== 'decode'
        ? { digipin: data.digipin, latitude: plusCoordinates?.latitude ?? latitude, longitude: plusCoordinates?.longitude ?? longitude }
        : { digipin, latitude: String(data.latitude), longitude: String(data.longitude) };
      saveResult(next);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to reach the DIGIPIN service.'); }
    finally { setLoading(false); }
  };

  const locate = () => {
    if (!navigator.geolocation) { setError('Location services are not available in this browser.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLatitude(coords.latitude.toFixed(6)); setLongitude(coords.longitude.toFixed(6)); setLocating(false); },
      () => { setError('We could not access your location. Check your browser permission and try again.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const copy = async () => { if (!result) return; await navigator.clipboard.writeText(result.digipin); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  const share = async () => {
    if (!result) return;
    const text = `My DIGIPIN is ${result.digipin} (${result.latitude}, ${result.longitude})`;
    if (navigator.share) await navigator.share({ title: 'DIGIPIN location', text }); else await navigator.clipboard.writeText(text);
  };
  const selectHistory = (item: Result) => { setResult(item); setLatitude(item.latitude); setLongitude(item.longitude); setDigipin(item.digipin); };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Pin Code Cafe DIGIPIN home"><img src="/pin-code-cafe-logo.jpg" alt="Pin Code Cafe 759001" /></a>
      <div className="service"><span className="status-dot" /> DIGIPIN service online</div>
      <a className="docs-link" href={`${API_BASE.replace(/\/api$/, '')}/api-docs`} target="_blank" rel="noreferrer">API docs <ExternalLink size={14} /></a>
      <a className="postal-brand" href="https://github.com/INDIAPOST-gov/digipin" target="_blank" rel="noreferrer" aria-label="India Post DIGIPIN repository"><img src="/india-post-logo.webp" alt="India Post" /></a>
    </header>

    <main>
      <section className="intro">
        <div><span className="eyebrow">India's precise digital address</span><h1>Find the code for<br /><em>exactly here.</em></h1></div>
        <p>Turn any location in India into a shareable 10-character DIGIPIN, or trace a code back to its coordinates.</p>
      </section>

      <section className="workspace">
        <div className="tool-panel">
          <div className="segmented" aria-label="Conversion mode">
            <button className={mode === 'encode' ? 'active' : ''} onClick={() => { setMode('encode'); setError(''); }}><MapPin size={17} /> Generate</button>
            <button className={mode === 'decode' ? 'active' : ''} onClick={() => { setMode('decode'); setError(''); }}><Compass size={17} /> Decode</button>
            <button className={mode === 'pluscode' ? 'active' : ''} onClick={() => { setMode('pluscode'); setError(''); }}><Grid2X2 size={17} /> Plus Code</button>
          </div>

          <form onSubmit={submit}>
            <div className="form-heading"><h2>{mode === 'encode' ? 'Where are you?' : mode === 'decode' ? 'Enter a DIGIPIN' : 'Convert a Plus Code'}</h2><p>{mode === 'encode' ? 'Use your location or enter coordinates.' : mode === 'decode' ? 'Use the continuous 10-character code.' : 'Turn a full Google Plus Code into a DIGIPIN.'}</p></div>
            {mode === 'encode' ? <>
              <button type="button" className="locate-button" onClick={locate} disabled={locating}><LocateFixed size={18} className={locating ? 'spin' : ''} />{locating ? 'Finding your location…' : 'Use my current location'}</button>
              <div className="divider"><span>or enter manually</span></div>
              <div className="field-row">
                <label>Latitude<input inputMode="decimal" value={latitude} onChange={e => setLatitude(e.target.value)} placeholder="13.067526" /></label>
                <label>Longitude<input inputMode="decimal" value={longitude} onChange={e => setLongitude(e.target.value)} placeholder="80.270956" /></label>
              </div>
              <p className="field-note">Coverage: 2.5°–38.5° N, 63.5°–99.5° E</p>
            </> : mode === 'decode' ? <label className="code-field">DIGIPIN<input autoFocus maxLength={10} value={digipin} onChange={e => setDigipin(e.target.value.toUpperCase().replace(/[^23456789CJKLMPFT]/g, ''))} placeholder="4T396F42L7" /><span>{digipin.length}/10</span></label> : <>
              <label className="code-field">Plus Code<input autoFocus value={plusCode} onChange={e => setPlusCode(e.target.value.toUpperCase())} placeholder="JJFH+MG Dhenkanal" /></label>
              <p className="field-note">Enter a full code, or add a locality after a short code. Locality search uses OpenStreetMap.</p>
              <details className="plus-guide">
                <summary><HelpCircle size={17} /> How to find a Plus Code <ChevronDown className="guide-chevron" size={16} /></summary>
                <div className="guide-steps">
                  <article><div className="guide-visual"><Search size={22} /><span className="guide-dot" /></div><span className="step-number">1</span><h3>Open Google Maps</h3><p>Open the app or visit <a href="https://maps.google.com" target="_blank" rel="noreferrer">maps.google.com</a>.</p></article>
                  <article><div className="guide-visual"><MapPin size={24} /><span className="guide-sheet">Dropped pin</span></div><span className="step-number">2</span><h3>View Plus Code</h3><p>Drop a pin, then open the location sheet and find its Plus Code.</p></article>
                  <article><div className="guide-visual"><Clipboard size={22} /><span className="guide-code">JJFH+MG</span></div><span className="step-number">3</span><h3>Copy code</h3><p>Copy the code with its locality, for example <strong>JJFH+MG Dhenkanal</strong>.</p></article>
                </div>
              </details>
            </>}
            {error && <div className="error" role="alert">{error}</div>}
            <button className="primary" disabled={loading || (mode === 'encode' ? !validCoords : mode === 'decode' ? !validCode : !validPlusCode)}>{loading ? <RefreshCw className="spin" size={18} /> : mode === 'encode' ? <MapPin size={18} /> : mode === 'decode' ? <Compass size={18} /> : <Grid2X2 size={18} />}{loading ? 'Working…' : mode === 'encode' ? 'Generate DIGIPIN' : mode === 'decode' ? 'Decode location' : 'Convert to DIGIPIN'}</button>
          </form>
        </div>

        <div className={`result-panel ${result ? 'has-result' : ''}`}>
          <div className="map-visual" aria-hidden="true"><div className="map-road road-one" /><div className="map-road road-two" /><div className="map-water" />{result && <div className="pin"><MapPin size={22} fill="currentColor" /></div>}<span className="map-label label-one">Precise location</span><span className="map-label label-two">India</span></div>
          {result ? <div className="result-content">
            <span className="result-label">Your DIGIPIN</span><div className="code-display"><img src="/digipin-logo.png" alt="DIGIPIN" /><strong>{formatCode(result.digipin)}</strong></div>
            <div className="coordinates"><span><small>Latitude</small>{Number(result.latitude).toFixed(6)}</span><span><small>Longitude</small>{Number(result.longitude).toFixed(6)}</span></div>
            <div className="result-actions"><button onClick={copy}>{copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? 'Copied' : 'Copy code'}</button><button onClick={share}><Share2 size={17} /> Share</button></div>
            <div className="map-actions">
              <a href={`https://www.openstreetmap.org/?mlat=${result.latitude}&mlon=${result.longitude}#map=18/${result.latitude}/${result.longitude}`} target="_blank" rel="noreferrer"><Map size={17} /> OpenStreetMap <ExternalLink size={14} /></a>
              <a href={`https://www.google.com/maps/search/?api=1&query=${result.latitude}%2C${result.longitude}`} target="_blank" rel="noreferrer"><MapPin size={17} /> Google Maps <ExternalLink size={14} /></a>
            </div>
          </div> : <div className="empty-result"><span><MapPin size={26} /></span><h2>Your precise address<br />will appear here</h2><p>DIGIPIN identifies an area of approximately 4 × 4 metres.</p></div>}
        </div>
      </section>

      {history.length > 0 && <section className="recent"><div><span className="eyebrow">This session</span><h2>Recent locations</h2></div><div className="recent-list">{history.map(item => <button key={item.digipin} onClick={() => selectHistory(item)}><MapPin size={16} /><strong>{formatCode(item.digipin)}</strong><span>{Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}</span><ExternalLink size={15} /></button>)}</div></section>}
    </main>
    <footer>
      <a href="https://pincode.cafe" aria-label="Visit Pin Code Cafe">Built by <b>Pin Code Cafe</b></a>
      <a href="https://github.com/INDIAPOST-gov/digipin" target="_blank" rel="noreferrer">Built with love on India Post's open-source DIGIPIN <ExternalLink size={13} /></a>
      <span>DIGIPIN is an initiative of the Department of Posts, Government of India.</span>
    </footer>
  </div>;
}
