/* the Loop static frontend. All privileged operations live in Supabase. */
(()=>{'use strict';
const cfg=window.THE_LOOP_CONFIG||{};
const configured=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey);
const db=configured?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
const root=document.getElementById('app');
let me=null,profile=null,view='overview',toastTimer;
let pendingMobileView=null;
let recoveryMode=false; // Supabase PASSWORD_RECOVERY event enables the reset screen.
let colorMode='light';
try{colorMode=localStorage.getItem('the-loop-color-mode')==='dark'?'dark':'light'}catch{}
document.documentElement.dataset.mode=colorMode;
function toggleColorMode(){colorMode=colorMode==='dark'?'light':'dark';document.documentElement.dataset.mode=colorMode;try{localStorage.setItem('the-loop-color-mode',colorMode)}catch{};const b=document.getElementById('color-mode-toggle');if(b){b.textContent=colorMode==='dark'?'☀ Light mode':'☾ Dark mode';b.setAttribute('aria-pressed',String(colorMode==='dark'))}}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const photoUrl=v=>safeUrl(v);
function announce(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('on'),3500)}
const route=()=>{const hash=location.hash.slice(1)||'/';const [path,arg]=hash.split('?');return {path,arg};};
const siteRoot=()=> (cfg.siteUrl||location.origin+location.pathname).split('#')[0].split('?')[0].replace(/\/*$/,'/');
const resetUrl=()=>siteRoot()+'?page=reset';
const onResetUrl=()=>new URLSearchParams(location.search).get('page')==='reset';
const urlFor=s=>siteRoot()+'#/u/'+encodeURIComponent(s);
const avatar=p=>p?.username==='demo'?`<img class="avatar" alt="Fictional professional headshot of John Smith" src="demo-businessman.webp">`:p?.photo_url&&photoUrl(p.photo_url)?`<img class="avatar" alt="Profile portrait" src="${esc(photoUrl(p.photo_url))}">`:`<div class="avatar" aria-hidden="true">${esc((p?.full_name||'LC').trim().slice(0,2).toUpperCase())}</div>`;
function nav(){return `<header class="header"><div class="shell nav"><a class="brand" href="#/"><img src="loop-logo.png" alt="the Loop logo"  class="brand-logo"> the Loop</a><div class="nav-links"><a class="btn ghost small" href="#/demo">Demo</a>${me?'<a class="btn secondary small" href="#/dashboard">My Account</a><button class="btn small" id="logout">Log out</button>':'<a class="btn secondary small" href="#/auth">Log in</a><a class="btn small" href="#/auth?signup">Get started</a>'}<button type="button" id="color-mode-toggle" class="btn secondary small mode-toggle" aria-pressed="${colorMode==='dark'}" aria-label="Toggle dark mode">${colorMode==='dark'?'☀ Light mode':'☾ Dark mode'}</button></div><div class="mobile-actions"><button type="button" id="mobile-theme-toggle" class="mobile-icon" aria-label="${colorMode==='dark'?'Switch to light mode':'Switch to dark mode'}" title="Change appearance">${colorMode==='dark'?'☀':'☾'}</button><button type="button" id="mobile-menu-toggle" class="mobile-icon" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mobile-menu">☰</button></div></div><nav class="mobile-menu" id="mobile-menu" aria-label="Mobile navigation" hidden>${me?'<a href="#/dashboard">My Account</a><a href="#/dashboard" data-mobile-view="edit">Edit Card</a><a href="#/dashboard" data-mobile-view="share">Share & QR</a><a href="#/dashboard" data-mobile-view="contacts">Connections</a>':'<a href="#/auth">Log in</a><a href="#/auth?signup">Get started</a>'}<a href="#/demo">Demo</a>${me?'<button type="button" id="mobile-logout">Log out</button>':''}</nav></header>`}
function render(content){root.innerHTML=nav()+content+`<footer class="footer"><div class="shell">© ${new Date().getFullYear()} the Loop · Digital connections, made simple.</div></footer>`;
const modeButton=document.getElementById('color-mode-toggle');if(modeButton)modeButton.onclick=toggleColorMode;
const mobileMode=document.getElementById('mobile-theme-toggle');if(mobileMode)mobileMode.onclick=()=>{toggleColorMode();mobileMode.textContent=colorMode==='dark'?'☀':'☾';mobileMode.setAttribute('aria-label',colorMode==='dark'?'Switch to light mode':'Switch to dark mode')};
const menu=document.getElementById('mobile-menu'),menuButton=document.getElementById('mobile-menu-toggle');
if(menuButton&&menu){menuButton.onclick=()=>{const open=menu.hidden;menu.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close navigation menu':'Open navigation menu');menuButton.textContent=open?'✕':'☰'};
menu.querySelectorAll('[data-mobile-view]').forEach(link=>link.onclick=e=>{e.preventDefault();view=link.dataset.mobileView;menu.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.textContent='☰';if(location.hash==='#/dashboard')showDashboard();else {pendingMobileView=link.dataset.mobileView;location.hash='/dashboard'}});
menu.querySelectorAll('a:not([data-mobile-view])').forEach(link=>link.onclick=()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.textContent='☰'});
}
const signOut=async()=>{await db.auth.signOut();me=null;profile=null;location.hash='/'};
const b=document.getElementById('logout');if(b)b.onclick=signOut;
const mobileLogout=document.getElementById('mobile-logout');if(mobileLogout)mobileLogout.onclick=signOut;
}

const feature=(icon,name,desc)=>`<div class="feature"><div class="emoji">${icon}</div><h3>${name}</h3><p>${desc}</p></div>`;
function landing(){render(`<main class="shell"><section class="hero"><div><div class="eyebrow">Your network. Your way.</div>
<h1>Meet. Connect.<br>Stay in the <span class="slogan-accent">Loop.</span></h1>
<p>A beautiful digital business card you can share by QR code, AirDrop, Messages, email, or link. Exchange details without needing an app or physical card.</p><div class="actions"><a class="btn" href="#/auth?signup">Create your free card →</a><a class="btn secondary" href="#/demo">Explore the demo</a></div></div>
<div class="hero-art hero-phone">
  <img src="hero-phone-demo.png" alt="Preview of the Loop digital business card and QR sharing" class="hero-phone-image">
</div>
<div class="mini-card"><div class="avatar">JS</div><h3>John Smith</h3><p>RN, BSN</p><p>Patient Care · Healthcare Professional</p><div class="fake-icons"><span>✉</span><span>↗</span><span>▦</span></div><div style="margin-top:20px;background:#6555e8;color:white;border-radius:11px;padding:11px;font-weight:700">Save Contact</div></div></div></section><section class="section"><h2>Everything you need to connect</h2><p>Fast to create, delightful to share, effortless to save.</p><div class="feature-grid">${feature('▦','Instant QR sharing','Show your QR code. Anyone can scan it with their phone camera.')}${feature('↗','Share anywhere','Use your phone’s native share menu for supported apps and nearby sharing.')}${feature('⇄','Two-way exchange','Visitors share their details with you, even if they have no account.')}${feature('◉','Beautiful profiles','Your photo, contact links, bio and professional identity in one place.')}${feature('✎','Update anytime','Edit your details. Your permanent card link stays the same.')}${feature('▤','Save to contacts','Recipients can download a contact file for their phone.')}</div></section></main>`)}
const demo={full_name:'John Smith',title:'RN, BSN',company:'Example Medical Center',bio:'Registered nurse • Patient care and professional networking',email:'john.smith@example.com',phone:'+1 202-555-0147',website:'',linkedin:'https://www.linkedin.com/',username:'demo',photo_url:''};
const visibleCard=p=>({...p,email:p.show_email===false?'':p.email,phone:p.show_phone===false?'':p.phone});
function emailContactLink(p){
  const firstName=String(p.full_name||'there').trim().split(/\s+/)[0];
  const subject='Connecting Through the Loop';
  const body=`Hi ${firstName},\n\nI came across your digital business card on the Loop and wanted to reach out.\n\nBest regards,`;
  return `mailto:${encodeURIComponent(p.email||'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function card(p){p=visibleCard(p);return `<article class="profile-view theme-${esc(THEMES.includes(p.theme)?p.theme:"violet")}"><div class="cover"></div><div class="identity">${avatar(p)}<h2>${esc(p.full_name||'Unnamed profile')}</h2><div class="title">${esc(p.title||'')}</div>${p.company?`<p class="muted" style="margin-top:6px">${esc(p.company)}</p>`:''}<p class="bio">${esc(p.bio||'')}</p><div class="social">${p.email?`<a href="${esc(emailContactLink(p))}">✉ Email</a>`:''}${p.phone?`<a href="tel:${esc(p.phone.replace(/[^+\d]/g,''))}">☎ Phone</a>`:''}${safeUrl(p.linkedin)?`<a href="${esc(safeUrl(p.linkedin))}" target="_blank" rel="noopener noreferrer">in LinkedIn</a>`:''}${safeUrl(p.website)?`<a href="${esc(safeUrl(p.website))}" target="_blank" rel="noopener noreferrer">↗ Website</a>`:''}</div><button class="btn block" data-action="save-contact">↓ Save Contact</button><button class="btn secondary block" data-action="native-share">↗ Share This Card</button></div></article>`}
function vcard(p){
  p=visibleCard(p);
  // Build a standard vCard 3.0 for import into Android/iOS Contacts.
  const clean=v=>String(v??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,c=>'\\'+c);
  const fullName=String(p.full_name||'').trim();
  const parts=fullName.split(/\s+/);
  const surname=parts.length>1?parts.pop():'';
  const given=parts.join(' ');
  const lines=['BEGIN:VCARD','VERSION:3.0','FN:'+clean(fullName),
    'N:'+clean(surname)+';'+clean(given)+';;;'];
  if(p.company)lines.push('ORG:'+clean(p.company));
  if(p.title)lines.push('TITLE:'+clean(p.title));
  if(p.email)lines.push('EMAIL;TYPE=INTERNET:'+clean(p.email));
  if(p.phone)lines.push('TEL;TYPE=CELL:'+clean(p.phone));
  if(safeUrl(p.website))lines.push('URL:'+safeUrl(p.website));
  if(safeUrl(p.linkedin))lines.push('URL;TYPE=LinkedIn:'+safeUrl(p.linkedin));
  if(p.username&&p.username!=='demo')lines.push('URL;TYPE=theLoop:'+urlFor(p.username));
  if(safeUrl(p.photo_url))lines.push('PHOTO;VALUE=URI:'+safeUrl(p.photo_url));
  if(p.bio)lines.push('NOTE:'+clean(p.bio));
  lines.push('END:VCARD');
  return lines.join('\r\n');
}
function download(name,data,type){const blob=new Blob([data],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function saveContact(p){download((p.full_name||'contact').trim().replace(/[^a-z\d-_]/gi,'_')+'.vcf',vcard(p),'text/vcard;charset=utf-8');announce('Contact file downloaded')}
async function share(p){const url=p.username==='demo'?siteRoot()+'#/demo':urlFor(p.username||'demo');try{if(navigator.share){await navigator.share({title:`${p.full_name} | the Loop`,text:`Connect with ${p.full_name}`,url});return}}catch(e){if(e.name==='AbortError')return;}copy(url)}
async function copy(s){try{await navigator.clipboard.writeText(s);announce('Link copied to clipboard')}catch{announce('Copy the link shown on screen')}}
function wireCard(p){document.querySelectorAll('[data-action="save-contact"]').forEach(b=>b.onclick=()=>saveContact(p));document.querySelectorAll('[data-action="native-share"]').forEach(b=>b.onclick=()=>share(p));document.querySelectorAll('[data-action="copy-link"]').forEach(b=>b.onclick=()=>copy(urlFor(p.username)))}

function drawQR(p) {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;

  if (typeof window.qrcode !== 'function') {
    canvas.replaceWith(
      Object.assign(document.createElement('p'), {
        textContent: 'QR code library unavailable.'
      })
    );
    return;
  }

  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(p.username==='demo'?siteRoot()+'#/demo':urlFor(p.username));
    qr.make();

    const count = qr.getModuleCount();
    const cellSize = 6;
    const margin = 4;
    const size = (count + margin * 2) * cellSize;

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#182335';

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            (col + margin) * cellSize,
            (row + margin) * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }

    canvas.style.width = '210px';
    canvas.style.height = '210px';
    canvas.style.maxWidth = '100%';
  } catch (error) {
    console.error('QR generation failed:', error);
    announce('Could not generate QR code');
  }
}

function qrBlock(p){return `<div class="qrcard"><canvas id="qr-canvas" aria-label="QR code for public card"></canvas><p class="hint" style="margin-top:12px;text-align:center">Scan with your phone camera</p></div><div class="public-url" style="margin:12px 0">${esc(urlFor(p.username))}</div><button class="btn secondary block" data-action="copy-link">Copy card link</button>`}
function demoPage(){
  const demoUrl=siteRoot()+'#/demo';
  render(`<main class="demo-page"><div class="demo-intro"><span class="demo-tag">● LIVE DEMO</span><h1>A Smarter Way to <span>Connect</span></h1><p>See how the Loop makes it easy to share your professional identity, grow your network, and stay in touch.</p></div><div class="demo-layout"><div class="demo-profile">${card(demo)}</div><aside class="demo-qr-panel"><div class="demo-qr-icon" aria-hidden="true">▦</div><h2>Scan or share</h2><p>Scan this QR code with your phone to explore the Loop demo.</p><div class="demo-qr-box"><canvas id="qr-canvas" aria-label="Scannable QR code linking to the Loop demo"></canvas></div><p class="demo-qr-caption">Open with your phone camera<br>No app required</p><button type="button" class="btn secondary block" id="demo-copy-link">Copy demo link</button></aside></div><div class="demo-exchange panel"><h3>Try contact exchange</h3><p class="hint">Explore the form below. This is a demonstration: no contact details are submitted or stored.</p>${exchangeForm(true)}</div><p class="demo-disclaimer">John Smith is a fictional example. The demo phone number and LinkedIn profile are illustrative only.</p></main>`);
  wireCard(demo);
  // Demo-only contact actions must never initiate a call or open a nonexistent social profile.
  document.querySelectorAll('.demo-profile .social a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();announce('Demo only — create your own card to activate your contact links.')}));
  document.querySelectorAll('.demo-profile [data-action="save-contact"]').forEach(b=>b.onclick=()=>{saveContact(demo);announce('Fictional sample contact downloaded')});
  document.getElementById('demo-copy-link').onclick=()=>copy(demoUrl);
  drawQR(demo);
  wireExchange(demo,true);
}
function exchangeForm(isDemo){return `<form id="exchange-form" class="form"><div class="field"><label for="v-name">Your full name *</label><input id="v-name" name="name" maxlength="100" required autocomplete="name"></div><div class="field"><label for="v-email">Email *</label><input id="v-email" name="email" type="email" maxlength="200" required autocomplete="email"></div><div class="field"><label for="v-phone">Phone (optional)</label><input id="v-phone" name="phone" type="tel" maxlength="40" autocomplete="tel"></div><div class="field"><label for="v-company">Company (optional)</label><input id="v-company" name="company" maxlength="120" autocomplete="organization"></div><div class="field"><label for="v-message">Message (optional)</label><textarea id="v-message" name="message" maxlength="500" placeholder="Great meeting you at..."></textarea></div><label class="check"><input name="consent" type="checkbox" required><span>I agree to share these details with the card owner so they can contact me. The owner will receive my submission.</span></label>${!isDemo&&cfg.turnstileSiteKey?`<div class="cf-turnstile" data-sitekey="${esc(cfg.turnstileSiteKey)}"></div>`:''}<button class="btn block" type="submit">⇄ Exchange information</button><div id="exchange-feedback" aria-live="polite"></div></form>`}
function wireExchange(p,isDemo){const form=document.getElementById('exchange-form');if(!form)return;form.onsubmit=async(e)=>{e.preventDefault();const msg=document.getElementById('exchange-feedback'),d=new FormData(form),btn=form.querySelector('button[type=submit]');if(!form.reportValidity())return;if(isDemo){msg.innerHTML='<div class="success">Demo complete! In the live app, this would securely send your details to the card owner.</div>';form.reset();return}if(!configured){announce('Set up Supabase first');return}btn.disabled=true;msg.textContent='Sending…';try{const token=window.turnstile?.getResponse()||'';const response=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/exchange-contact',{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabaseAnonKey},body:JSON.stringify({username:p.username,name:d.get('name'),email:d.get('email'),phone:d.get('phone'),company:d.get('company'),message:d.get('message'),consent:d.get('consent')==='on',turnstileToken:token})});const json=await response.json().catch(()=>({}));if(!response.ok)throw Error(json.error||'Could not send contact information');msg.innerHTML='<div class="success">Details shared successfully! You can also save this person’s contact above.</div>';form.reset();window.turnstile?.reset()}catch(err){msg.innerHTML=`<div class="error">${esc(err.message)}</div>`}finally{btn.disabled=false}}}
async function publicPage(username){render('<div class="loader">Loading card…</div>');if(!configured){render(`<main class="center-wrap"><div class="panel">Connect Supabase in <code>config.js</code> to open real public cards. <a href="#/demo">View demo →</a></div></main>`);return}const {data,error}=await db.from('public_cards').select('*').eq('username',username).maybeSingle();if(error||!data){render('<main class="center-wrap"><div class="panel"><h2>Card not found</h2><p class="muted">This profile does not exist or is private.</p><a class="btn" href="#/">Back home</a></div></main>');return}render(`<main class="public-wrap">${card(data)}<div class="panel" style="margin-bottom:18px"><h3 style="margin-bottom:13px">Scan or share</h3>${qrBlock(data)}</div><div class="panel form-section"><h3>Exchange contact information</h3><p class="hint" style="margin-top:8px">Send your details to ${esc(data.full_name||'the card owner')}. No account needed.</p>${exchangeForm(false)}</div></main>`);wireCard(data);drawQR(data);wireExchange(data,false);if(cfg.turnstileSiteKey)loadTurnstile()}
function loadTurnstile(){if(document.querySelector('script[data-turnstile]')){window.turnstile?.render?.('.cf-turnstile');return}const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js';s.async=true;s.defer=true;s.dataset.turnstile='true';document.head.append(s)}
async function authPage(signup=false){if(me){location.hash='/dashboard';return}render(`<main class="center-wrap"><div class="panel auth"><div class="brand"><img src="loop-logo.png" alt="the Loop logo" class="brand-logo">the Loop</div><h2>Welcome ${signup?'to the Loop':'back'}</h2><p class="muted">${signup?'Create an account to design and share your digital card.':'Log in to manage your digital card and contacts.'}</p>${!configured?'<div class="info-strip" style="margin-top:18px">Demo mode: add your Supabase URL and publishable key in config.js to activate accounts.</div>':''}<div class="tabs"><button class="tab ${signup?'':'active'}" data-tab="login">Log in</button><button class="tab ${signup?'active':''}" data-tab="signup">Sign up</button></div><form class="form" id="auth-form">${signup?'<div class="field"><label>Full name</label><input name="name" autocomplete="name" required maxlength="100"></div>':''}<div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" autocomplete="${signup?'new-password':'current-password'}" required></div><button class="btn block" type="submit" ${configured?'':'disabled'}>${signup?'Create account':'Log in'}</button></form>${!signup?'<button id="reset" class="btn ghost block" style="margin-top:10px">Forgot password?</button>':''}<div id="auth-message" aria-live="polite"></div></div></main>`);document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>authPage(b.dataset.tab==='signup'));const r=document.getElementById('reset');if(r)r.onclick=async()=>{const email=document.querySelector('[name=email]').value.trim();if(!email){announce('Enter your email first');return}const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:resetUrl()});announce(error?error.message:'Check your email for a reset link')};document.getElementById('auth-form').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target),email=fd.get('email'),password=fd.get('password'),box=document.getElementById('auth-message');box.textContent='Working…';let result=signup?await db.auth.signUp({email,password,options:{data:{full_name:fd.get('name')},emailRedirectTo:siteRoot()+'#/dashboard'}}):await db.auth.signInWithPassword({email,password});if(result.error){box.innerHTML=`<div class="error">${esc(result.error.message)}</div>`;return}if(signup&&!result.data.session){box.innerHTML='<div class="success">Check your email to confirm your account, then log in.</div>';return}me=result.data.user;location.hash='/dashboard'}}
async function getMyProfile(){let {data,error}=await db.from('profiles').select('*').eq('id',me.id).maybeSingle();if(error)throw error;if(data)return data;const name=me.user_metadata?.full_name||'',fallback=('user'+me.id.replace(/-/g,'').slice(0,9));const {data:newData,error:insertError}=await db.from('profiles').insert({id:me.id,username:fallback,full_name:name,email:me.email||''}).select().single();if(insertError)throw insertError;return newData}
const THEMES=['violet','ocean','emerald','sunset','rose','midnight','executive-navy','graphite','slate','forest','champagne','burgundy','ivory','steel-blue','espresso','teal-professional'];
const fields=[['full_name','Full name','text'],['username','Unique card username','text'],['title','Job title / credentials','text'],['company','Company / organization','text'],['bio','Bio','textarea'],['email','Public contact email','email'],['phone','Public phone','tel'],['website','Website (https://...)','url'],['linkedin','LinkedIn (https://...)','url']];
function themeSelector(p){return `<div class="wide theme-editor"><label>Card color theme</label><div class="theme-options">${THEMES.map(t=>`<label class="theme-pick"><input type="radio" name="theme" value="${t}" ${((p.theme||'violet')===t)?'checked':''}><span class="theme-dot theme-${t}"></span><span class="theme-name">${t.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}</span></label>`).join('')}</div><p class="hint">Choose a color to preview it on your card.</p><div id="theme-preview">${card(p)}</div></div>`}
function photoPicker(p){return `<div class="wide photo-editor"><label>Profile picture</label><div class="photo-actions"><button type="button" class="btn secondary" id="choose-photo">Upload photo</button><button type="button" class="btn secondary" id="take-photo">Take a photo</button><button type="button" class="btn secondary" id="edit-photo" ${p.photo_url?'':'disabled'}>Crop / edit photo</button><button type="button" class="btn ghost" id="remove-photo">Remove photo</button></div><input hidden type="file" id="photo-input" accept="image/*"><input hidden type="file" id="camera-input" accept="image/*" capture="user"><input type="hidden" id="f-photo_url" name="photo_url" value="${esc(p.photo_url||'')}"><p class="hint" id="photo-message">JPG, PNG, or WebP, up to 8 MB. Crop and adjust before uploading. Photos are stored in a public profile-photo bucket.</p><div class="photo-preview" id="photo-preview">${avatar(p)}</div><div class="crop-editor" id="crop-editor" hidden><h3>Crop your profile photo</h3><p class="hint">Drag the picture to reposition it, then adjust the zoom. The circular guide shows what your profile photo will look like.</p><div class="crop-stage" id="crop-stage"><canvas id="crop-canvas" width="320" height="320" aria-label="Crop photo preview"></canvas></div><label class="crop-zoom-label" for="crop-zoom">Zoom <input id="crop-zoom" type="range" min="1" max="3" step="0.01" value="1"></label><div class="crop-actions"><button class="btn" type="button" id="apply-crop">Apply crop</button><button class="btn secondary" type="button" id="cancel-crop">Cancel</button></div></div></div>`}
function profileForm(p){return `<form class="profile-form" id="profile-form">${fields.map(([key,label,type])=>`<div class="field ${key==='bio'?'wide':''}"><label for="f-${key}">${label}</label>${type==='textarea'?`<textarea id="f-${key}" name="${key}" maxlength="500">${esc(p[key]||'')}</textarea>`:`<input id="f-${key}" name="${key}" type="${type}" maxlength="${key==='username'?30:300}" value="${esc(p[key]||'')}" ${key==='full_name'||key==='username'?'required':''}>`}</div>`).join('')}${photoPicker(p)}${themeSelector(p)}<label class="check wide"><input type="checkbox" name="show_email" ${p.show_email?'checked':''}><span>Show contact email on public card</span></label><label class="check wide"><input type="checkbox" name="show_phone" ${p.show_phone?'checked':''}><span>Show phone number on public card</span></label><label class="check wide"><input type="checkbox" name="published" ${p.published?'checked':''}><span>Publish my card so anyone with the link can view the information shown here.</span></label><div class="wide"><button type="submit" class="btn">Save profile</button><span id="save-message" class="hint" style="margin-left:10px"></span></div></form>`}
function wireProfileEditor(){
 const form=document.getElementById('profile-form'),draft={...profile},themePreview=document.getElementById('theme-preview');
 form.querySelectorAll('[name=theme]').forEach(r=>r.onchange=()=>{draft.theme=r.value;themePreview.innerHTML=card(draft)});
 const imgInput=document.getElementById('photo-input'),cameraInput=document.getElementById('camera-input');
 const editor=document.getElementById('crop-editor'),canvas=document.getElementById('crop-canvas'),ctx=canvas.getContext('2d');
 const zoom=document.getElementById('crop-zoom'),stage=document.getElementById('crop-stage'),editBtn=document.getElementById('edit-photo');
 const status=document.getElementById('photo-message'),submit=form.querySelector('button[type=submit]');
 let cropImage=null,offsetX=0,offsetY=0,zoomValue=1,dragging=false,startX=0,startY=0;
 function renderCrop(){if(!cropImage)return;const size=canvas.width;ctx.clearRect(0,0,size,size);ctx.fillStyle='#e9edf4';ctx.fillRect(0,0,size,size);const scale=Math.max(size/cropImage.width,size/cropImage.height)*zoomValue;const w=cropImage.width*scale,h=cropImage.height*scale;offsetX=Math.max((size-w)/2,Math.min((w-size)/2,offsetX));offsetY=Math.max((size-h)/2,Math.min((h-size)/2,offsetY));ctx.drawImage(cropImage,(size-w)/2+offsetX,(size-h)/2+offsetY,w,h);ctx.save();ctx.fillStyle='rgba(0,0,0,.40)';ctx.beginPath();ctx.rect(0,0,size,size);ctx.arc(size/2,size/2,size/2-3,0,Math.PI*2,true);ctx.fill('evenodd');ctx.restore();ctx.beginPath();ctx.arc(size/2,size/2,size/2-3,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#fff';ctx.stroke();}
 async function startCrop(source){try{const image=await createImageBitmap(source);if(cropImage?.close)cropImage.close();cropImage=image;offsetX=offsetY=0;zoomValue=1;zoom.value='1';editor.hidden=false;renderCrop();editor.scrollIntoView({behavior:'smooth',block:'nearest'});status.textContent='Adjust the crop, then click Apply crop.';}catch(e){status.textContent='Could not open photo for editing: '+e.message;}}
 document.getElementById('choose-photo').onclick=()=>imgInput.click();document.getElementById('take-photo').onclick=()=>cameraInput.click();
 document.getElementById('remove-photo').onclick=()=>{draft.photo_url='';document.getElementById('f-photo_url').value='';document.getElementById('photo-preview').innerHTML=avatar(draft);themePreview.innerHTML=card(draft);editBtn.disabled=true;editor.hidden=true;status.textContent='Photo removed from preview. Click Save profile to apply.'};
 const process=e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent='Choose a JPG, PNG, or WebP photo.';return}if(file.size>8*1024*1024){status.textContent='Choose a photo smaller than 8 MB.';return}startCrop(file)};
 imgInput.onchange=process;cameraInput.onchange=process;
 editBtn.onclick=async()=>{if(!draft.photo_url)return;status.textContent='Opening current photo…';try{const response=await fetch(draft.photo_url,{mode:'cors'});if(!response.ok)throw Error('Photo unavailable');await startCrop(await response.blob())}catch(e){status.textContent='Could not load the existing photo for editing. Please upload it again to crop.'}};
 document.getElementById('cancel-crop').onclick=()=>{editor.hidden=true;status.textContent='Crop cancelled. Your existing photo is unchanged.'};
 zoom.oninput=()=>{zoomValue=Number(zoom.value);renderCrop()};
 stage.onpointerdown=e=>{if(!cropImage)return;dragging=true;startX=e.clientX;startY=e.clientY;stage.setPointerCapture(e.pointerId)};
 stage.onpointermove=e=>{if(!dragging)return;const rect=stage.getBoundingClientRect(),factor=canvas.width/rect.width;offsetX+=(e.clientX-startX)*factor;offsetY+=(e.clientY-startY)*factor;startX=e.clientX;startY=e.clientY;renderCrop()};
 stage.onpointerup=stage.onpointercancel=()=>{dragging=false};
 document.getElementById('apply-crop').onclick=async()=>{
  if(!cropImage)return;submit.disabled=true;status.textContent='Cropping and uploading…';
  try{const size=640,c=document.createElement('canvas');c.width=c.height=size;const context=c.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,size,size);const factor=size/canvas.width,scale=Math.max(canvas.width/cropImage.width,canvas.height/cropImage.height)*zoomValue;const w=cropImage.width*scale,h=cropImage.height*scale;context.drawImage(cropImage,((canvas.width-w)/2+offsetX)*factor,((canvas.height-h)/2+offsetY)*factor,w*factor,h*factor);
   const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not crop photo')),'image/jpeg',0.85));
   const path=`${me.id}/avatar-${Date.now()}.jpg`;const {error}=await db.storage.from('profile-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});if(error)throw error;
   const {data}=db.storage.from('profile-photos').getPublicUrl(path);draft.photo_url=data.publicUrl;document.getElementById('f-photo_url').value=data.publicUrl;document.getElementById('photo-preview').innerHTML=avatar(draft);themePreview.innerHTML=card(draft);editBtn.disabled=false;editor.hidden=true;status.textContent='Cropped photo uploaded! Click Save profile to apply it.';
  }catch(err){status.textContent='Photo upload failed: '+err.message}finally{submit.disabled=false}
 };
}
async function resizePhoto(file){const image=await createImageBitmap(file);try{const max=700,scale=Math.min(1,max/Math.max(image.width,image.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not process photo')),'image/jpeg',0.83))}finally{image.close()}}
async function dashboard(){if(!configured){authPage();return}if(!me){location.hash='/auth';return}render('<div class="loader">Loading your dashboard…</div>');try{profile=await getMyProfile()}catch(e){render(`<main class="center-wrap"><div class="panel"><h2>Unable to load profile</h2><p class="error">${esc(e.message)}</p><p class="hint">Did you run schema.sql in your Supabase SQL editor?</p></div></main>`);return}if(pendingMobileView){view=pendingMobileView;pendingMobileView=null}showDashboard()}
function showDashboard(){render(`<main class="shell layout"><aside class="side">${[['overview','⌂ Overview'],['edit','✎ Edit card'],['share','▦ Share & QR'],['contacts','⇄ Connections']].map(([v,label])=>`<button data-view="${v}" class="${view===v?'active':''}">${label}</button>`).join('')}</aside><section><div class="top-row"><div><h1>${({overview:'My Account',edit:'Edit your card',share:'Share your card',contacts:'Your connections'})[view]}</h1><p>Welcome${profile.full_name?', '+esc(profile.full_name.split(' ')[0]):''}. Your network starts here.</p></div>${profile.published?`<a href="#/u/${encodeURIComponent(profile.username)}" class="btn secondary small">View public card ↗</a>`:'<span class="hint">Card is private</span>'}</div><div id="dash-body"></div></section></main>`);document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;showDashboard()});const el=document.getElementById('dash-body');if(view==='overview'){el.innerHTML=`<div class="dashboard-grid"><div class="panel"><h2 style="font-size:20px;margin-bottom:10px">Your digital identity</h2><p class="muted" style="margin-bottom:20px">Keep your card current and share it anywhere.</p>${card(profile)}</div><div class="panel"><h3 style="margin-bottom:16px">Quick share</h3>${qrBlock(profile)}<p class="hint" style="margin-top:16px">${profile.published?'Your card is public.':'Publish your card in Edit card before sharing.'}</p></div></div>`;wireCard(profile);drawQR(profile)}else if(view==='edit'){el.innerHTML=`<div class="panel"><div class="info-strip" style="margin-bottom:20px">Only publish information you're comfortable sharing publicly. Changes to your username will change your card link.</div>${profileForm(profile)}</div>`;document.getElementById('profile-form').onsubmit=saveProfile;wireProfileEditor()}else if(view==='share'){el.innerHTML=`<div class="dashboard-grid"><div class="panel"><h2 style="font-size:19px">Your QR code</h2><p class="hint" style="margin:8px 0 20px">Others can scan this directly with their phone cameras.</p>${qrBlock(profile)}<div class="actions"><button class="btn" data-action="native-share">↗ Share card</button><button class="btn secondary" data-action="share-by-email">✉ Email card</button><button class="btn secondary" id="share-qr-image">↗ Share QR image</button><button class="btn secondary" id="download-qr">↓ Download QR</button></div>${!profile.published?'<p class="error">Your card is currently private. Publish it in Edit card before sharing.</p>':''}</div><div>${card(profile)}</div></div>`;wireCard(profile);drawQR(profile);document.querySelector('[data-action="share-by-email"]').onclick=()=>{const subject=`${profile.full_name||'My'} digital business card | the Loop`;const body=`Hello,\n\nHere is my digital business card:\n${profile.full_name||''}${profile.title?' — '+profile.title:''}\n${urlFor(profile.username)}\n\nScan the QR code shown on my card page, or open the link above to save my contact information.\n\nBest regards,\n${profile.full_name||''}`;window.location.href=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;};document.getElementById('share-qr-image').onclick=async()=>{const canvas=document.getElementById('qr-canvas');if(!canvas||!canvas.width){announce('QR code is not ready');return}const base64=canvas.toDataURL('image/png').split(',')[1];const binary=atob(base64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const file=new File([bytes],'the-loop-qr.png',{type:'image/png'});if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:`${profile.full_name} | the Loop`,text:`My digital business card: ${urlFor(profile.username)}`,files:[file]});return}catch(err){if(err.name==='AbortError')return;}}const a=document.createElement('a');a.download='the-loop-qr.png';a.href=canvas.toDataURL('image/png');a.click();announce('QR image downloaded. Attach it to your email manually.');};document.getElementById('download-qr').onclick=()=>{const canvas=document.getElementById('qr-canvas');if(!canvas)return;const a=document.createElement('a');a.download='the-loop-qr.png';a.href=canvas.toDataURL('image/png');a.click()}}else if(view==='contacts'){el.innerHTML='<div class="panel"><h3>People who exchanged details with you</h3><p class="hint" style="margin-top:8px">Private to your account.</p><div class="contact-search-row"><label for="contact-search">Search your connections</label><input id="contact-search" type="search" placeholder="Search name, email, phone, company…" autocomplete="off" aria-controls="contacts-list"><p id="contact-count" class="contact-count" aria-live="polite"></p></div><div id="contacts-list" class="loader">Loading connections…</div></div>';loadContacts()}}
async function saveProfile(e){e.preventDefault();const f=new FormData(e.target);const o={};for(const [key] of fields)o[key]=String(f.get(key)||'').trim();o.photo_url=String(f.get('photo_url')||'').trim();o.theme=String(f.get('theme')||'violet');if(!THEMES.includes(o.theme)){announce('Choose a valid theme');return}o.username=o.username.toLowerCase();if(!/^[a-z0-9_-]{3,30}$/.test(o.username)){announce('Username must be 3–30 letters, digits, _ or -');return}for(const key of ['website','linkedin','photo_url'])if(o[key]&&!safeUrl(o[key])){announce(`${key} must be a valid http(s) URL`);return}o.published=f.has('published');o.show_email=f.has('show_email');o.show_phone=f.has('show_phone');const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;const {data,error}=await db.from('profiles').update(o).eq('id',me.id).select().single();btn.disabled=false;if(error){announce(error.code==='23505'?'Username already taken':error.message);return}
profile = data;
view = 'overview';
showDashboard();
announce('Profile saved successfully!');
window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function loadContacts(){
  const target=document.getElementById('contacts-list');
  const search=document.getElementById('contact-search');
  const counter=document.getElementById('contact-count');
  if(!target||!search||!counter)return;
  const {data,error}=await db.from('contact_exchanges').select('name,email,phone,company,message,created_at').eq('owner_id',me.id).order('created_at',{ascending:false}).limit(100);
  if(!target.isConnected)return;
  if(error){target.innerHTML=`<div class="error">${esc(error.message)}</div>`;return}
  const contacts=data||[];
  target.className='';
  const draw=()=>{
    const query=search.value.trim().toLocaleLowerCase();
    const filtered=contacts.filter(c=>[c.name,c.email,c.phone,c.company,c.message].some(v=>String(v||'').toLocaleLowerCase().includes(query)));
    counter.textContent=`${filtered.length} of ${contacts.length} connections${contacts.length===100?' (latest 100 loaded)':''}`;
    target.innerHTML=filtered.length?filtered.map(c=>`<div class="contact-item"><h3>${esc(c.name)}</h3><p>${esc(c.email)} ${c.phone?'· '+esc(c.phone):''}</p>${c.company?`<p>${esc(c.company)}</p>`:''}${c.message?`<p>“${esc(c.message)}”</p>`:''}<p class="contact-date">${esc(new Date(c.created_at).toLocaleString())}</p></div>`).join(''):`<div class="empty">${query?'No connections match your search.':'No connections yet. Share your card to get started!'}</div>`;
  };
  search.addEventListener('input',draw);
  draw();
}
async function resetPage(){
  if(!configured){render('<main class="center-wrap"><div class="panel">Password reset is unavailable until Supabase is configured.</div></main>');return}
  if(!recoveryMode){render('<main class="center-wrap"><div class="panel auth"><h2>Verifying password-reset link</h2><p class="muted">If you just opened a reset email, please wait for verification. If it does not continue, your link may have expired; request a new one from Log in.</p><a class="btn secondary" href="'+esc(siteRoot()+'#/auth')+'">Go to Log in</a></div></main>');return}
  if(!me){render('<main class="center-wrap"><div class="panel auth"><h2>Verifying reset link…</h2><p class="muted">Please wait a moment.</p></div></main>');return}
  render('<main class="center-wrap"><form id="reset-form" class="panel auth form"><h2>Set a new password</h2><p class="muted">Enter a new password for your Loop account.</p><div class="field"><label for="reset-new">New password</label><input id="reset-new" type="password" name="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label for="reset-confirm">Confirm new password</label><input id="reset-confirm" type="password" name="confirm" minlength="8" autocomplete="new-password" required></div><button class="btn block" type="submit">Update password</button><div id="reset-message" aria-live="polite"></div></form></main>');
  document.getElementById('reset-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),password=String(f.get('password')||''),confirm=String(f.get('confirm')||''),box=document.getElementById('reset-message'),btn=e.target.querySelector('button[type=submit]');if(password!==confirm){box.innerHTML='<div class="error">Passwords do not match.</div>';return}btn.disabled=true;box.textContent='Updating…';try{const {error}=await db.auth.updateUser({password});if(error)throw error;recoveryMode=false;box.innerHTML='<div class="success">Password updated. You can now log in with your new password.</div>';await db.auth.signOut();history.replaceState(null,'',siteRoot()+'#/auth');me=null;authPage(false)}catch(err){box.innerHTML=`<div class="error">${esc(err.message)}</div>`;btn.disabled=false}};
}
async function navigate(){if(onResetUrl()){resetPage();return}const {path,arg}=route();if(path==='/'){landing();return}if(path==='/demo'){demoPage();return}if(path==='/auth'){authPage(arg==='signup');return}if(path==='/dashboard'){dashboard();return}if(path==='/reset'){resetPage();return}if(path.startsWith('/u/')){publicPage(decodeURIComponent(path.slice(3)));return}landing()}
if(db){
  db.auth.onAuthStateChange((event,session)=>{
    me=session?.user||null;
    if(event==='PASSWORD_RECOVERY'){
      recoveryMode=true;
      // Keep the query-based reset route: Supabase may use the fragment for auth tokens.
      history.replaceState(null,'',resetUrl());
      resetPage();
      return;
    }
    if(event==='SIGNED_OUT' && !recoveryMode && !onResetUrl())navigate();
  });
  db.auth.getSession().then(({data})=>{
    me=data.session?.user||null;
    // Password recovery event takes precedence over ordinary account navigation.
    if(onResetUrl()||recoveryMode)resetPage();
    else navigate();
  });
}else navigate();
window.addEventListener('hashchange',()=>{view='overview';navigate()});
})();
