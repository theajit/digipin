import React from 'react';
import { ArrowDown, ArrowUpRight, Coffee, MapPin } from 'lucide-react';

const offerings = [
  ['01', 'Coffee', 'Made for slow starts, quick breaks, and one more cup.'],
  ['02', 'Small plates', 'Familiar flavours served with a fresh point of view.'],
  ['03', 'Good company', 'A neighbourhood table with room for every conversation.'],
];

export function App() {
  return <div className="site-shell">
    <header className="nav">
      <a href="#top" className="logo-link" aria-label="Pin Code Cafe home"><img src="/pin-code-cafe-logo.jpg" alt="Pin Code Cafe 759001" /></a>
      <nav aria-label="Primary navigation"><a href="#cafe">The cafe</a><a href="#address">759001</a><a className="nav-cta" href="#opening">Opening soon <ArrowDown size={15} /></a></nav>
    </header>

    <main id="top">
      <section className="hero" aria-labelledby="hero-title">
        <img className="hero-image" src="/cafe-hero.jpg" alt="Coffee and a fresh plate on a wooden table inside a contemporary neighbourhood cafe" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <p>Arriving in Dhenkanal</p>
          <h1 id="hero-title">PIN CODE CAFÉ</h1>
          <div className="hero-footer"><strong>COFFEE HAS A<br />NEW ADDRESS.</strong><span>759001</span></div>
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
        {offerings.map(([number, title, copy]) => <article key={number}><span>{number}</span><Coffee size={21} /><h3>{title}</h3><p>{copy}</p></article>)}
      </section>

      <section className="opening" id="opening">
        <div className="opening-photo" role="img" aria-label="Warm cafe counter and seating" />
        <div className="opening-copy"><p className="section-label">Next stop</p><h2>Opening in<br />759001.</h2><p>The address, hours, and first pour will be announced here.</p><a href="#top">Back to the top <ArrowUpRight size={17} /></a></div>
      </section>
    </main>

    <footer><img src="/pin-code-cafe-logo.jpg" alt="Pin Code Cafe" /><p>Dhenkanal · Odisha · 759001</p><span>© {new Date().getFullYear()} Pin Code Cafe</span></footer>
  </div>;
}
