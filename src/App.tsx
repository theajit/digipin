import { useMemo, useState } from 'react';
import { Check, Clipboard, Coffee, Compass, ExternalLink, LocateFixed, Map, MapPin, RefreshCw, Share2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const ALPHABET = /^[23456789CJKLMPFT]{10}$/;
type Mode = 'encode' | 'decode';
type Result = { digipin: string; latitude: string; longitude: string };

const formatCode = (code: string) => code.length === 10 ? `${code.slice(0, 3)} ${code.slice(3, 7)} ${code.slice(7)}` : code;

export function App() {
  const [mode, setMode] = useState<Mode>('encode');
  const [latitude, setLatitude] = useState('13.067526');
  const [longitude, setLongitude] = useState('80.270956');
  const [digipin, setDigipin] = useState('');
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

  const saveResult = (next: Result) => {
    setResult(next);
    setHistory(current => [next, ...current.filter(item => item.digipin !== next.digipin)].slice(0, 3));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const endpoint = mode === 'encode' ? 'encode' : 'decode';
      const body = mode === 'encode' ? { latitude: Number(latitude), longitude: Number(longitude) } : { digipin };
      const response = await fetch(`${API_BASE}/digipin/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
      const next = mode === 'encode'
        ? { digipin: data.digipin, latitude, longitude }
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
      <a className="brand" href="#" aria-label="Pin Code Cafe DIGIPIN home"><span className="brand-mark"><Coffee size={19} /></span><span>PIN CODE <b>CAFE</b></span></a>
      <div className="service"><span className="status-dot" /> DIGIPIN service online</div>
      <a className="docs-link" href={`${API_BASE.replace(/\/api$/, '')}/api-docs`} target="_blank" rel="noreferrer">API docs <ExternalLink size={14} /></a>
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
          </div>

          <form onSubmit={submit}>
            <div className="form-heading"><h2>{mode === 'encode' ? 'Where are you?' : 'Enter a DIGIPIN'}</h2><p>{mode === 'encode' ? 'Use your location or enter coordinates.' : 'Use the continuous 10-character code.'}</p></div>
            {mode === 'encode' ? <>
              <button type="button" className="locate-button" onClick={locate} disabled={locating}><LocateFixed size={18} className={locating ? 'spin' : ''} />{locating ? 'Finding your location…' : 'Use my current location'}</button>
              <div className="divider"><span>or enter manually</span></div>
              <div className="field-row">
                <label>Latitude<input inputMode="decimal" value={latitude} onChange={e => setLatitude(e.target.value)} placeholder="13.067526" /></label>
                <label>Longitude<input inputMode="decimal" value={longitude} onChange={e => setLongitude(e.target.value)} placeholder="80.270956" /></label>
              </div>
              <p className="field-note">Coverage: 2.5°–38.5° N, 63.5°–99.5° E</p>
            </> : <label className="code-field">DIGIPIN<input autoFocus maxLength={10} value={digipin} onChange={e => setDigipin(e.target.value.toUpperCase().replace(/[^23456789CJKLMPFT]/g, ''))} placeholder="4T396F42L7" /><span>{digipin.length}/10</span></label>}
            {error && <div className="error" role="alert">{error}</div>}
            <button className="primary" disabled={loading || (mode === 'encode' ? !validCoords : !validCode)}>{loading ? <RefreshCw className="spin" size={18} /> : mode === 'encode' ? <MapPin size={18} /> : <Compass size={18} />}{loading ? 'Working…' : mode === 'encode' ? 'Generate DIGIPIN' : 'Decode location'}</button>
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
      <span>Built by <b>Pin Code Cafe</b></span>
      <a href="https://github.com/INDIAPOST-gov/digipin" target="_blank" rel="noreferrer">Built with love on India Post's open-source DIGIPIN <ExternalLink size={13} /></a>
      <span>DIGIPIN is an initiative of the Department of Posts, Government of India.</span>
    </footer>
  </div>;
}
