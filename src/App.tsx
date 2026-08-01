import React from 'react';
import { ArrowDown, ArrowUpRight, BriefcaseBusiness, Coffee, Copy, Dices, ExternalLink, MapPin } from 'lucide-react';

const offerings = [
  ['01', 'Coffee', 'Made for slow starts, quick breaks, and one more cup.', Coffee],
  ['02', 'Work', 'A change of scene for focused hours and bright ideas.', BriefcaseBusiness],
  ['03', 'Games', 'Put the screens down, pick a side, and stay for another round.', Dices],
];

export function App() {
  return <div className="site-shell">
    <header className="nav">
      <a href="#top" className="logo-link" aria-label="Pin Code Cafe home"><img src="/pin-code-cafe-logo.jpg" alt="Pin Code Cafe 759001" /></a>
      <nav aria-label="Primary navigation"><a href="#cafe">The cafe</a><a href="#address">759001</a><a href="#digipin">DIGIPIN</a><a className="nav-cta" href="https://digipin.pincode.cafe">Create DIGIPIN <ArrowUpRight size={15} /></a></nav>
    </header>

    <main id="top">
      <section className="hero" aria-labelledby="hero-title">
        <img className="hero-image" src="/cafe-hero.jpg" alt="Coffee and a fresh plate on a wooden table inside a contemporary neighbourhood cafe" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <p>Arriving in Dhenkanal</p>
          <h1 id="hero-title">PIN CODE CAFÉ</h1>
          <div className="hero-footer"><strong>COFFEE · WORK · GAMES</strong><span>759001</span></div>
        </div>
      </section>

      <section className="postcode-band" id="address">
        <div><MapPin size={23} /><span>Dhenkanal, Odisha</span></div>
        <strong>759001</strong>
        <p>Our pin on the map.<br />Your place in the neighbourhood.</p>
      </section>

      <section className="statement" id="cafe">
        <p className="section-label">The neighbourhood table</p>
        <h2>Come for the coffee.<br /><em>Stay for where it takes you.</em></h2>
        <p className="statement-copy">Pin Code Cafe is being made as a place to pause, meet, work, laugh, and return to. Rooted in 759001, open in spirit.</p>
      </section>

      <section className="offerings" aria-label="What to expect">
        {offerings.map(([number, title, copy, Icon]) => <article key={number as string}><span>{number as string}</span><Icon size={21} /><h3>{title as string}</h3><p>{copy as string}</p></article>)}
      </section>

      <section className="digipin-section" id="digipin">
        <div className="postal-lockup"><img src="/india-post-logo.webp" alt="India Post" /><span>Powered by India's open-source geospatial addressing system</span></div>
        <div className="digipin-heading"><p className="section-label">Our precise address</p><h2>Find the pin.<br /><em>Skip the guesswork.</em></h2></div>
        <div className="digipin-ticket">
          <div className="digipin-code"><img src="/digipin-logo.png" alt="DIGIPIN" /><div><small>Pin Code Cafe DIGIPIN</small><strong>2MT MC3T JMK</strong></div></div>
          <div className="digipin-coordinates"><span>20.624188° N</span><span>85.628813° E</span></div>
          <div className="digipin-actions"><button onClick={() => navigator.clipboard.writeText('2MTMC3TJMK')}><Copy size={16} /> Copy DIGIPIN</button><a href="https://www.google.com/maps/search/?api=1&query=20.6241875%2C85.6288125" target="_blank" rel="noreferrer"><MapPin size={16} /> View location</a></div>
        </div>
        <a className="digipin-cta" href="https://digipin.pincode.cafe">Create a DIGIPIN for your location <ExternalLink size={17} /></a>
      </section>

      <section className="opening" id="opening">
        <div className="opening-photo" role="img" aria-label="Warm cafe counter and seating" />
        <div className="opening-copy"><p className="section-label">Next stop</p><h2>Opening in<br />759001.</h2><p>Coffee for the pause. Tables for the work. Games for everything after.</p><a href="#top">Back to the top <ArrowUpRight size={17} /></a></div>
      </section>
    </main>

    <footer><img src="/pin-code-cafe-logo.jpg" alt="Pin Code Cafe" /><p>Dhenkanal · Odisha · 759001</p><span>© {new Date().getFullYear()} Pin Code Cafe</span></footer>
  </div>;
}
