/* the Loop static frontend. All privileged operations live in Supabase. */
(()=>{'use strict';
const cfg=window.THE_LOOP_CONFIG||{};
const configured=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey);
const db=configured?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{experimental:{passkey:true}}}):null;
const root=document.getElementById('app');
let me=null,profile=null,view='overview',toastTimer;
let goodbyeConfirmed=false,goodbyeFeedbackToken=''; // Local result of a successfully verified permanent deletion.
let pendingMobileView=null;
let unreadConnections=0;
 let connectionLastViewed=null;
 let connectionPoll=null;
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
const siteRoot=()=> (location.origin+location.pathname).split('#')[0].split('?')[0].replace(/\/*$/,'/'); // Always use the current website origin, not an old GitHub Pages config URL.
const resetUrl=()=>siteRoot()+'?page=reset';
const onResetUrl=()=>new URLSearchParams(location.search).get('page')==='reset';
// Preserve URL errors before Supabase cleans authentication fragments.
const initialRecoveryError=(()=>{const p=new URLSearchParams(location.hash.slice(1));return p.get('error_description')||p.get('error_code')||''})();
const onConfirmedUrl=()=>new URLSearchParams(location.search).get('page')==='confirmed';
const urlFor=s=>siteRoot()+'#/u/'+encodeURIComponent(s);

// A personal QR shortcut contains only a public card username, never a login token.
// Its URL remains useful when the Supabase login session expires.
const MY_QR_ROUTE='/my-qr';
const MY_QR_PREFIX='/my-qr/u/';
const MY_QR_LINK=username=>siteRoot()+'#'+MY_QR_PREFIX+encodeURIComponent(username);
const MY_QR_LAST_KEY='loop-qr-shortcut-username';
const MY_QR_INSTALLED_KEY='loop-qr-installed-username'; // Set when a user starts the QR shortcut or app installation.
const MY_QR_INSTALL_NAME='My Digital Card-the Loop';
const defaultDocumentTitle=document.title;
const isIOSDevice=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(/Macintosh/i.test(navigator.userAgent||'')&&navigator.maxTouchPoints>1);
const isAndroidDevice=()=>/Android/i.test(navigator.userAgent||'');
const isMobileDevice=()=>isIOSDevice()||isAndroidDevice();
const isAndroidChrome=()=>isAndroidDevice()&&/Chrome\//i.test(navigator.userAgent||'')&&!/EdgA|SamsungBrowser|OPR\//i.test(navigator.userAgent||'');
const isDesktopChromium=()=>!isMobileDevice()&&/(Chrome\/|Chromium\/|Edg\/)/i.test(navigator.userAgent||'')&&!/(OPR\/|Firefox\/)/i.test(navigator.userAgent||'');
const canPromptQuickQrInstall=()=>isAndroidChrome()||isDesktopChromium();
let deferredQuickQrPrompt=null;
// A supported Android or desktop Chromium browser may offer a native install prompt.
// The dedicated QR manifest starts the public QR app without a login token.
// The selected username is saved locally for the fixed start route to restore.
window.addEventListener('beforeinstallprompt',event=>{
  const availableManifests=[...document.querySelectorAll('link[rel=manifest]')];
  if(!canPromptQuickQrInstall()||!location.hash.startsWith('#'+MY_QR_PREFIX)||availableManifests.length!==1||!availableManifests[0].dataset.loopQuickQrManifest)return;
  event.preventDefault();
  deferredQuickQrPrompt=event;
});
window.addEventListener('appinstalled',()=>{deferredQuickQrPrompt=null;});
function updateQuickQrInstallMetadata(enabled){
  document.title=enabled?MY_QR_INSTALL_NAME:defaultDocumentTitle;
  let manifest=document.querySelector('link[data-loop-quick-qr-manifest]');
  // iOS Safari shortcuts preserve the exact visible URL, with no PWA start_url.
  // Chromium on Android and desktop can instead offer an installable QR app.
  if(enabled&&canPromptQuickQrInstall()){
    if(!manifest){manifest=document.createElement('link');manifest.rel='manifest';manifest.dataset.loopQuickQrManifest='1';document.head.appendChild(manifest);}
    manifest.href=siteRoot()+'loop-qr.webmanifest';
  }else{
    manifest?.remove();
    deferredQuickQrPrompt=null;
  }
  let icon=document.querySelector('link[data-loop-quick-qr-icon]');
  if(enabled){
    if(!icon){icon=document.createElement('link');icon.rel='apple-touch-icon';icon.dataset.loopQuickQrIcon='1';document.head.appendChild(icon);}
    icon.href=siteRoot()+'loop-qr-icon-192.png';
  }else icon?.remove();
}
function afterQuickQrLogin(){
  let next='';
  try{if(sessionStorage.getItem('loop-return-to-my-qr')==='1'){next=MY_QR_ROUTE;sessionStorage.removeItem('loop-return-to-my-qr');}}catch{}
  return next||'/dashboard';
}

const avatar=p=>p?.username==='demo'?`<img class="avatar" alt="Fictional professional headshot of John Smith" src="demo-businessman.webp">`:p?.photo_url&&photoUrl(p.photo_url)?`<img class="avatar" alt="Profile portrait" src="${esc(photoUrl(p.photo_url))}">`:`<div class="avatar" aria-hidden="true">${esc((p?.full_name||'LC').trim().slice(0,2).toUpperCase())}</div>`;
function nav(){return `<header class="header"><div class="shell nav"><a class="brand" href="#/"><img src="loop-logo.png" alt="the Loop logo"  class="brand-logo"> the Loop</a><div class="nav-links"><a class="btn ghost small" href="#/demo">Demo</a>${me?'<a class="btn secondary small" href="#/dashboard">My Account</a><span class="connection-badge nav-unread" data-unread-count hidden></span><button class="btn small" id="logout">Log out</button>':'<a class="btn secondary small" href="#/auth">Log in</a><a class="btn small" href="#/auth?signup">Get started</a>'}<button type="button" id="color-mode-toggle" class="btn secondary small mode-toggle" aria-pressed="${colorMode==='dark'}" aria-label="Toggle dark mode">${colorMode==='dark'?'☀ Light mode':'☾ Dark mode'}</button></div><div class="mobile-actions"><button type="button" id="mobile-theme-toggle" class="mobile-icon" aria-label="${colorMode==='dark'?'Switch to light mode':'Switch to dark mode'}" title="Change appearance">${colorMode==='dark'?'☀':'☾'}</button><button type="button" id="mobile-menu-toggle" class="mobile-icon" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mobile-menu">☰</button></div></div><style>
/* Compact, scannable mobile navigation. Keep longer account menus scrollable. */
#mobile-menu { max-height:calc(100dvh - 105px); overflow-y:auto; overscroll-behavior:contain; }
/* Labels are non-interactive separators, unlike the large tappable links. */
#mobile-menu .loop-menu-heading { display:flex; align-items:center; gap:12px; color:#8fa3bf; font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; padding:17px 22px 4px; background:transparent; border:0; cursor:default; user-select:none; }
#mobile-menu .loop-menu-heading::after { content:""; flex:1 1 auto; border-top:1px solid rgba(180,197,220,.2); }
#mobile-menu .loop-menu-heading:first-child { padding-top:9px; }
#mobile-menu .loop-menu-action { display:block; }
#mobile-menu .loop-menu-subtitle { display:block; color:#aebed5; font-size:12px; font-weight:400; line-height:1.35; padding-top:3px; }
#mobile-menu .loop-menu-device-note { color:#beb1ff; font-weight:600; }
</style><nav class="mobile-menu" id="mobile-menu" aria-label="Mobile navigation" hidden>${me?`
<div class="loop-menu-heading">CARD ACTIONS</div>
<a href="#/dashboard" data-mobile-view="overview">My Account</a>
<a href="#/dashboard" data-mobile-view="edit">Edit My Card</a>
<a href="#/dashboard" data-mobile-view="share">Share My Digital Card</a>
<a href="#/dashboard" data-mobile-view="contacts">My Connections <span class="connection-badge" data-unread-count hidden></span></a>
<div class="loop-menu-heading">SPECIAL FEATURES</div>
<a class="loop-menu-action" href="#/dashboard" data-mobile-view="qr-shortcut">${isMobileDevice()?'Add My QR Code to Home Screen':'Add My QR Code to Desktop'}<span class="loop-menu-subtitle loop-menu-device-note">${isMobileDevice()?'Recommended for iPhone users':'Quick access from your desktop'}</span><span class="loop-menu-subtitle">${isMobileDevice()?'Open your QR code in one tap. Also works on Android.':'Open your scannable QR code in one click.'}</span></a>
<a class="loop-menu-action" href="#/dashboard" data-mobile-view="wallet">Add My Card to Google Wallet<span class="loop-menu-subtitle loop-menu-device-note">For Android users</span><span class="loop-menu-subtitle">Save your digital card to Google Wallet.</span></a>
<a href="#/dashboard" data-mobile-view="signature">Create Email Signature</a>
<a href="#/demo">Explore the Demo</a>
<a href="#/dashboard" data-mobile-view="settings">Settings</a>`:'<a href="#/auth">Log in</a><a href="#/auth?signup">Get started</a><a href="#/demo">Explore the Demo</a>'}${me?'<button type="button" id="mobile-logout">Log out</button>':''}</nav></header>`}
function render(content){document.getElementById('loop-passkey-onboarding')?.remove();root.innerHTML=nav()+content+`<footer class="footer"><div class="shell">© ${new Date().getFullYear()} the Loop · Meet. Connect. Stay in the Loop.</div></footer>`;
syncUnreadBadges();
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
<p>A beautiful digital business card you can share by QR code, AirDrop, Messages, email, or link. Exchange details without needing an app or physical card.</p><style>
/* Clear action hierarchy: Create (primary), Explore (outlined), Sign in (quiet). */
.loop-home-actions {
  display: grid;
  grid-template-columns: minmax(0, 1.38fr) minmax(0, 1fr) max-content;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  max-width: 760px;
}
.loop-home-actions .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-width: 0;
  min-height: 50px;
  box-sizing: border-box;
  line-height: 1.35;
  padding: 11px 14px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  white-space: normal;
  transition: transform .15s ease, background-color .15s ease, box-shadow .15s ease;
}
.loop-home-actions .btn:hover { transform: translateY(-1px); }
.loop-home-actions .btn.loop-home-create {
  background: #5b4cf0;
  color: #fff;
  border: 1px solid #5b4cf0;
}
.loop-home-actions .btn.loop-home-create:hover { background: #4f40d9; border-color: #4f40d9; }
.loop-home-actions .btn.loop-home-demo {
  background: var(--card, #fff);
  color: #5546de;
  border: 1px solid #5b4cf0;
}
.loop-home-actions .btn.loop-home-demo:hover { background: rgba(91,76,240,.08); }
.loop-home-actions .btn.loop-home-signin {
  background: var(--card, #fff);
  border: 1px solid var(--line, #dbe2ea);
  color: var(--ink, #182335);
  padding-inline: 14px;
}
.loop-home-actions .btn.loop-home-signin:hover {
  background: rgba(91,76,240,.06);
  border-color: #a79ff3;
}
/* Dark theme: Explore the demo matches the Sign in button. */
html[data-mode="dark"] .loop-home-actions .btn.loop-home-demo {
  background: var(--card, #232d3f);
  border: 1px solid var(--line, #3a4b64);
  color: var(--ink, #f8fafc);
}
html[data-mode="dark"] .loop-home-actions .btn.loop-home-demo:hover {
  background: rgba(91,76,240,.06);
  border-color: #a79ff3;
}
/* On narrow displays, keep the two main actions together and move Sign in beneath. */
@media (max-width: 820px) {
  .loop-home-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .loop-home-actions .btn.loop-home-create,
  .loop-home-actions .btn.loop-home-demo { min-height: 62px; }
  .loop-home-actions .btn.loop-home-signin { grid-column: 1 / -1; min-height: 42px; }
}
@media (max-width: 390px) {
  .loop-home-actions .btn { font-size: 13px; padding-inline: 9px; }
}
</style><div class="actions loop-home-actions"><a class="btn loop-home-create" href="#/auth?signup">Create your digital card →</a><a class="btn loop-home-demo" href="#/demo">Explore the demo →</a><a class="btn loop-home-signin" href="#/auth">Sign in →</a></div></div><div class="hero-art hero-phone"><img src="hero-phone-demo.png" alt="Phone displaying a sample the Loop card alongside QR sharing" class="hero-phone-image"></div></section><section class="section"><h2>Everything you need to connect</h2><p>Fast to create, delightful to share, effortless to save.</p><div class="feature-grid">${feature('▦','Instant QR sharing','Show your QR code. Anyone can scan it with their phone camera.')}${feature('↗','Share anywhere','Use your phone’s native share menu for supported apps and nearby sharing.')}${feature('⇄','Two-way exchange','Visitors share their details with you, even if they have no account.')}${feature('◉','Beautiful profiles','Your photo, contact links, bio and professional identity in one place.')}${feature('✎','Update anytime','Edit your details. Your permanent card link stays the same.')}${feature('▤','Save to contacts','Recipients can download a contact file for their phone.')}</div></section></main>`)}
const demo={full_name:'John Smith',title:'RN, BSN',company:'Example Medical Center',bio:'Registered nurse • Patient care and professional networking',email:'john.smith@example.com',phone:'+1 202-555-0147',website:'',linkedin:'https://www.linkedin.com/',username:'demo',photo_url:''};
// Existing public email/work-phone toggles are retained. New personal fields are opt-in only.
const visibleCard=p=>({
  ...p,
  email:p.show_email===false?'':p.email,
  phone:p.show_phone===false?'':p.phone,
  personal_phone:p.show_personal_phone===true?p.personal_phone:'',
  additional_phone:p.show_additional_phone===true?p.additional_phone:'',
  work_address:p.show_work_address===true?p.work_address:''
});
function emailContactLink(p){
  const firstName=String(p.full_name||'there').trim().split(/\s+/)[0];
  const subject='Connecting Through the Loop';
  const body=`Hi ${firstName},\n\nI came across your digital business card on the Loop and wanted to reach out.\n\nBest regards,`;
  return `mailto:${encodeURIComponent(p.email||'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function card(p){
  p=visibleCard(p);
  const callLink=(phone,label)=>phone?`<a href="tel:${esc(String(phone).replace(/[^+\d]/g,''))}">☎ ${label}</a>`:'';
  return `<article class="profile-view theme-${esc(THEMES.includes(p.theme)?p.theme:'violet')}"><div class="cover"></div><div class="identity">${avatar(p)}<h2>${esc(p.full_name||'Unnamed profile')}</h2><div class="title">${esc(p.title||'')}</div>${p.company?`<p class="muted" style="margin-top:6px">${esc(p.company)}</p>`:''}<p class="bio">${esc(p.bio||'')}</p><div class="social">${p.email?`<a href="${esc(emailContactLink(p))}">✉ Work Email</a>`:''}${callLink(p.phone,'Work Phone')}${callLink(p.personal_phone,'Personal Phone')}${callLink(p.additional_phone,'Other Phone')}${safeUrl(p.linkedin)?`<a href="${esc(safeUrl(p.linkedin))}" target="_blank" rel="noopener noreferrer">in LinkedIn</a>`:''}${safeUrl(p.website)?`<a href="${esc(safeUrl(p.website))}" target="_blank" rel="noopener noreferrer">↗ Website</a>`:''}</div>${p.work_address?`<p class="muted" style="margin:12px 0 0;overflow-wrap:anywhere">⌖ Work address: ${esc(p.work_address)}</p>`:''}<button class="btn block" data-action="save-contact">↓ Save Contact</button><button class="btn secondary block" data-action="native-share">↗ Share This Card</button></div></article>`;
}
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
  if(p.email)lines.push('EMAIL;TYPE=INTERNET,WORK:'+clean(p.email));
  if(p.phone)lines.push('TEL;TYPE=WORK,VOICE:'+clean(p.phone));
  if(p.personal_phone)lines.push('TEL;TYPE=CELL:'+clean(p.personal_phone));
  if(p.additional_phone)lines.push('TEL;TYPE=VOICE:'+clean(p.additional_phone));
  if(p.work_address)lines.push('ADR;TYPE=WORK:;;'+clean(p.work_address)+';;;;');
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

async function myQuickQrPage(username=''){
  if(!configured){
    render('<main class="center-wrap"><div class="panel auth"><h2>My QR</h2><p class="muted">The Loop is temporarily unavailable.</p></div></main>');
    return;
  }
  // Existing generic shortcuts can upgrade to the owner's personalized URL.
  // This fallback never needs a stored password or authentication token.
  if(!username){
    // Installed Android QR app opens its fixed launch route. Restore the
    // public card chosen during installation, independently of login state.
    if(new URLSearchParams(location.search).get('qr-shortcut')==='1'){
      let selected='';
      try{selected=localStorage.getItem(MY_QR_INSTALLED_KEY)||'';}catch{}
      if(/^[A-Za-z0-9_.-]{1,60}$/.test(selected)){
        location.hash=MY_QR_PREFIX+encodeURIComponent(selected);
        return;
      }
    }
    if(me){
      render('<div class="loader">Opening your Loop QR…</div>');
      try{
        const owner=await getMyProfile();
        if(owner.deactivated_at){profile=owner;showReactivationPage();return;}
        if(!owner.published){
          render('<main class="center-wrap"><div class="panel auth"><h2>Your card is private</h2><p class="muted">Publish your card in Edit Card before adding a QR shortcut.</p><a href="#/dashboard" class="btn">My Account</a></div></main>');
          return;
        }
        try{localStorage.setItem(MY_QR_LAST_KEY,owner.username);}catch{}
        location.hash=MY_QR_PREFIX+encodeURIComponent(owner.username);
      }catch(error){
        render(`<main class="center-wrap"><div class="panel auth"><h2>Unable to load your card</h2><p class="error">${esc(error.message)}</p><a class="btn" href="#/dashboard">My Account</a></div></main>`);
      }
      return;
    }
    let saved='';
    try{saved=localStorage.getItem(MY_QR_LAST_KEY)||'';}catch{}
    if(saved && /^[A-Za-z0-9_.-]{1,60}$/.test(saved)){
      location.hash=MY_QR_PREFIX+encodeURIComponent(saved);
      return;
    }
    try{sessionStorage.setItem('loop-return-to-my-qr','1');}catch{}
    render(`<main class="center-wrap"><div class="panel auth" style="text-align:center"><img src="loop-logo.png" alt="the Loop" style="width:68px;height:68px;object-fit:contain;margin:0 auto 12px"><h1 style="font-size:27px;margin-bottom:12px">Set up your Loop QR</h1><p class="muted" style="margin-bottom:20px;line-height:1.7">Sign in once to connect this older shortcut to your public digital card. New personalized shortcuts won't require a login.</p><a class="btn block" href="#/auth">Sign in to set up →</a></div></main>`);
    return;
  }
  if(!/^[A-Za-z0-9_.-]{1,60}$/.test(username)){
    render('<main class="center-wrap"><div class="panel auth"><h2>Invalid QR shortcut</h2><p class="muted">This shortcut URL is not valid.</p><a class="btn" href="#/">Go home</a></div></main>');
    return;
  }
  render('<div class="loader">Loading your Loop QR…</div>');
  // Public-only view intentionally filters unpublished or deactivated accounts.
  // Never query the private profiles table for a signed-out shortcut.
  const {data:p,error}=await db.from('public_cards')
    .select('username, full_name, title, company')
    .eq('username',username).maybeSingle();
  if(error || !p){
    render(`<main class="center-wrap"><div class="panel auth" style="text-align:center"><h1 style="font-size:27px;margin-bottom:12px">Card unavailable</h1><p class="muted" style="line-height:1.7;margin-bottom:20px">This Loop card may be private, deactivated, deleted, or its username may have changed.</p><a class="btn secondary" href="#/auth">Sign in to manage your card</a></div></main>`);
    return;
  }
  const homeUrl=MY_QR_LINK(p.username);
  // Chrome's personalized QR install uses a fixed start route, so save only
  // this public username locally before it offers an install prompt.
  try{localStorage.setItem(MY_QR_LAST_KEY,p.username);}catch{}
  render(`<main class="shell" style="max-width:670px;padding-top:26px;padding-bottom:56px">
    <section class="panel" style="background:#223449;color:#fff;text-align:center;padding:clamp(20px,5vw,34px);border:1px solid #3f526c;box-shadow:0 16px 42px #0002">
      <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#d8e3f5;margin-bottom:12px">My Loop QR</p>
      <h1 style="font-size:clamp(25px,5vw,34px);line-height:1.25;margin-bottom:8px;color:#fff">${esc(p.full_name||'My Digital Card')}</h1>
      <p style="font-size:14px;color:#d7e1ed;margin:0 auto 22px;max-width:440px;line-height:1.5">${esc([p.title,p.company].filter(Boolean).join(' · '))}</p>
      <div style="display:grid;place-items:center;background:#fff;border-radius:20px;padding:18px;max-width:385px;margin:0 auto 17px">
        <canvas id="qr-canvas" aria-label="QR code linking to my live Loop digital card"></canvas>
      </div>
      <p style="font-size:14px;color:#e8eff9;font-weight:600">Scan to view my digital business card</p>
      <p style="font-size:12px;color:#b4c6dc;overflow-wrap:anywhere;margin-top:10px">${esc(urlFor(p.username))}</p>
    </section>
    <section class="panel" style="margin-top:16px;padding:20px">
      <div class="actions" style="margin-top:0;gap:9px">
        <button type="button" id="my-qr-share" class="btn">↗ Share Card</button>
        <button type="button" id="my-qr-copy" class="btn secondary">Copy Card Link</button>
        <button type="button" id="my-qr-download" class="btn secondary">↓ Download QR</button>
      </div>
    </section>
    <section class="panel" style="margin-top:16px;padding:20px">
      <div style="display:flex;align-items:flex-start;gap:13px">
        <div aria-hidden="true" style="flex:0 0 45px;width:45px;height:45px;border-radius:13px;background:#f0edff;color:#4f35d5;display:grid;place-items:center;font-size:25px">▦</div>
        <div style="min-width:0">
          <h2 style="font-size:19px;margin:2px 0 7px">My Digital Business Card</h2>
          <p class="muted" style="font-size:14px;line-height:1.6">Add your personal Loop QR shortcut to your ${isMobileDevice()?'phone or tablet':'computer'} for instant access, without logging in.</p>
        </div>
      </div>
      <button type="button" class="btn block" id="my-qr-install" aria-haspopup="dialog" aria-controls="my-qr-install-dialog" style="margin-top:16px;min-height:51px;background:#4f35d5;border-color:#4f35d5">${isMobileDevice()?'⌂ Add to Home Screen':'▣ Install on Computer'}</button>
      <p class="hint" style="margin-top:10px;text-align:center">Quick setup · No app download required</p>
    </section>
    <style>
      #my-qr-install-dialog::backdrop{background:rgba(10,17,31,.68);backdrop-filter:blur(2px)}
      #my-qr-install-dialog{width:420px;max-width:calc(100vw - 30px);max-height:calc(100dvh - 35px);overflow-y:auto;margin:auto;padding:22px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:20px;box-shadow:0 24px 72px #0006}
    </style>
    <dialog id="my-qr-install-dialog" aria-labelledby="my-qr-guide-heading" aria-modal="true">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
        <h2 id="my-qr-guide-heading" style="font-size:20px;margin:0">${isMobileDevice()?'Add to Home Screen':'Install on Computer'}</h2>
        <button type="button" id="my-qr-guide-close" class="btn ghost small" aria-label="Close shortcut instructions" style="min-width:38px;padding:6px">✕</button>
      </div>
      <p class="muted" style="font-size:14px;line-height:1.6;margin-bottom:14px">Keep this personal QR page open. Name your shortcut <strong>${esc(MY_QR_INSTALL_NAME)}</strong> when prompted.</p>
      <div id="my-qr-guide-steps" style="font-size:14px;line-height:1.8;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--bg)"></div>
      <p class="hint" style="margin-top:12px">${isMobileDevice()?'If offered both choices, select <strong>Create shortcut</strong> to pin this exact personal QR link.':'For the most reliable direct link, create a shortcut to this exact QR page. Some browsers can also install it as an app.'}</p>
      <button type="button" class="btn secondary block" id="my-qr-copy-shortcut" style="margin-top:16px">Copy personal shortcut link</button>
      <button type="button" class="btn block" id="my-qr-guide-done" style="margin-top:9px">Done</button>
    </dialog>
    <div style="text-align:center;margin-top:22px"><a class="btn ghost" href="#/dashboard">← My Account</a></div>
  </main>`);
  drawQR(p);
  const canvas=document.getElementById('qr-canvas');
  if(canvas){canvas.style.width='min(76vw,330px)';canvas.style.maxWidth='100%';canvas.style.height='auto';}
  document.getElementById('my-qr-share').onclick=()=>share(p);
  document.getElementById('my-qr-copy').onclick=()=>copy(urlFor(p.username));
  document.getElementById('my-qr-copy-shortcut').onclick=()=>copy(homeUrl);
  document.getElementById('my-qr-download').onclick=()=>{
    const c=document.getElementById('qr-canvas');if(!c?.width){announce('QR code is not ready.');return;}
    const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='my-loop-qr.png';a.click();
  };
  const myQrDialog=document.getElementById('my-qr-install-dialog');
  const showManualQrInstallSteps=()=>{
    const steps=document.getElementById('my-qr-guide-steps');
    const ua=navigator.userAgent||'';
    const isMac=/Macintosh|Mac OS X/i.test(ua)&&!isIOSDevice();
    const isEdge=/Edg\//i.test(ua);
    const isFirefox=/Firefox\//i.test(ua);
    const isSafari=/Safari\//i.test(ua)&&!/(Chrome\/|Chromium\/|Edg\/|OPR\/)/i.test(ua);
    const name='<strong>'+esc(MY_QR_INSTALL_NAME)+'</strong>';
    if(isAndroidDevice()){
      steps.innerHTML='<strong>Android · Chrome</strong><br>1. Keep this personal QR page open in Chrome.<br>2. Tap <strong>⋮</strong> → <strong>Add to Home screen</strong> (menu labels may vary).<br>3. If offered a choice, select <strong>Create shortcut</strong> to preserve this exact link.<br>4. Name it '+name+' and tap <strong>Add</strong>.';
    }else if(isIOSDevice()){
      steps.innerHTML='<strong>iPhone / iPad · Safari</strong><br>1. Open this personal QR page in <strong>Safari</strong>.<br>2. Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.<br>3. Name it '+name+' and tap <strong>Add</strong>.<br><br><small>To keep the exact QR page as a regular Safari shortcut, turn off “Open as Web App” if offered.</small>';
    }else if(isMac&&isSafari){
      steps.innerHTML='<strong>Mac · Safari</strong><br>1. Keep this personal QR page open in Safari.<br>2. From the menu bar, choose <strong>File → Add to Dock</strong> (macOS Sonoma or later).<br>3. Name it '+name+' and select <strong>Add</strong>.<br><br><small>If Add to Dock is unavailable, bookmark this exact page instead.</small>';
    }else if(isEdge){
      steps.innerHTML='<strong>Computer · Microsoft Edge</strong><br>1. Keep this personal QR page open in Edge.<br>2. Open <strong>⋯ → Apps → Install this site as an app</strong> (on some versions: More tools → Apps).<br>3. Confirm the name '+name+' and select <strong>Install</strong>.<br>4. Choose a desktop or taskbar shortcut if offered.<br><br><small>The installed QR app uses the card selected on this browser. To pin the exact URL instead, save this page as a browser shortcut.</small>';
    }else if(isDesktopChromium()){
      steps.innerHTML='<strong>Computer · Chrome</strong><br>1. Keep this personal QR page open in Chrome.<br>2. Open <strong>⋮ → Cast, save, and share → Create shortcut</strong> (the menu wording may vary).<br>3. Name it '+name+' and click <strong>Create</strong>.<br>4. If available, check <strong>Open as window</strong> for an app-like experience.<br><br><small>This shortcut preserves your exact personal QR address. If Chrome offers Install app instead, that also works with the card saved on this browser.</small>';
    }else if(isFirefox){
      steps.innerHTML='<strong>Computer · Firefox</strong><br>1. Keep your personal QR page open.<br>2. Save it as a bookmark with <strong>'+(isMac?'⌘ + D':'Ctrl + D')+'</strong> and name it '+name+'.<br>3. For a desktop shortcut, drag the site icon from the address bar to your desktop if your operating system supports it.<br><br><small>Firefox desktop does not offer the same web-app installation prompt as Chrome or Edge.</small>';
    }else{
      steps.innerHTML='<strong>Computer · Other browser</strong><br>1. Keep this personal QR page open.<br>2. Use the browser’s <strong>Create shortcut</strong>, <strong>Add to Dock</strong>, or <strong>Bookmark</strong> command, if available.<br>3. Name it '+name+'.<br><br><small>Use “Copy personal shortcut link” below if you need to open the exact QR page in another browser.</small>';
    }
    if(typeof myQrDialog.showModal==='function')myQrDialog.showModal();
    else myQrDialog.setAttribute('open','');
  };
  document.getElementById('my-qr-install').onclick=()=>{
    // Native install is only possible in supported browsers after an install event.
    // The manifest opens the generic QR app, which restores this browser's saved
    // public username. Without a prompt, offer the exact-link shortcut steps.
    try{localStorage.setItem(MY_QR_INSTALLED_KEY,p.username);}catch{}
    const usableManifest=document.querySelectorAll('link[rel=manifest]').length===1&&!!document.querySelector('link[data-loop-quick-qr-manifest]');
    if(deferredQuickQrPrompt&&canPromptQuickQrInstall()&&usableManifest){
      const prompt=deferredQuickQrPrompt;
      deferredQuickQrPrompt=null;
      try{
        prompt.prompt();
        Promise.resolve(prompt.userChoice).then(choice=>{
          if(choice?.outcome==='dismissed')announce('Installation cancelled. You can still create a shortcut from your browser menu.');
        }).catch(()=>{});
        return;
      }catch(_error){/* Some browsers decline the prompt: use safe manual fallback. */}
    }
    showManualQrInstallSteps();
  };
  const closeMyQrDialog=()=>{if(typeof myQrDialog.close==='function')myQrDialog.close();else myQrDialog.removeAttribute('open');};
  document.getElementById('my-qr-guide-close').onclick=closeMyQrDialog;
  document.getElementById('my-qr-guide-done').onclick=closeMyQrDialog;
  myQrDialog.addEventListener('click',event=>{if(event.target===myQrDialog)closeMyQrDialog();});
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
const ICEBREAKER_QUESTIONS = ["What's something you're passionate about outside of work?", "What's one skill you'd love to learn?", "What's the best career advice you've received?", "What's something you're looking forward to this year?", "What's one thing people might be surprised to learn about you?", "What's the most interesting part of your work?", "What's a professional goal you're excited about?", "What's one book or podcast you'd recommend?"];
function icebreakerSection(){return `<section class="loop-icebreaker" style="border:1px solid var(--line,#dbe2ea);border-radius:14px;padding:16px;margin:10px 0"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong>Beyond the Business Card</strong><span class="hint">Optional</span></div><p class="hint" style="margin:8px 0 12px">Make your introduction a little more memorable.</p><p id="icebreaker-question" style="font-weight:600;margin-bottom:10px"></p><input type="hidden" name="icebreaker_question" id="icebreaker-question-value"><label for="icebreaker-answer">Your answer (optional)</label><textarea id="icebreaker-answer" name="icebreaker_answer" maxlength="500" rows="2" placeholder="Share a little about yourself..."></textarea><button type="button" id="icebreaker-shuffle" class="btn secondary small" style="margin-top:10px">↻ Different question</button></section>`}
function wireIcebreaker(){const q=document.getElementById('icebreaker-question'),hidden=document.getElementById('icebreaker-question-value'),button=document.getElementById('icebreaker-shuffle'),answer=document.getElementById('icebreaker-answer');if(!q||!hidden||!button)return;let current=-1;const choose=()=>{let next=Math.floor(Math.random()*ICEBREAKER_QUESTIONS.length);if(ICEBREAKER_QUESTIONS.length>1&&next===current)next=(next+1)%ICEBREAKER_QUESTIONS.length;current=next;q.textContent=ICEBREAKER_QUESTIONS[current];hidden.value=ICEBREAKER_QUESTIONS[current];if(answer)answer.value=''};button.onclick=choose;choose()}
function exchangeForm(isDemo){return `<form id="exchange-form" class="form"><div class="field"><label for="v-name">Your full name *</label><input id="v-name" name="name" maxlength="100" required autocomplete="name"></div><div class="field"><label for="v-email">Email *</label><input id="v-email" name="email" type="email" maxlength="200" required autocomplete="email"></div><div class="field"><label for="v-phone">Phone (optional)</label><input id="v-phone" name="phone" type="tel" maxlength="40" autocomplete="tel"></div><div class="field"><label for="v-company">Company (optional)</label><input id="v-company" name="company" maxlength="120" autocomplete="organization"></div><div class="field"><label for="v-message">Message (optional)</label><textarea id="v-message" name="message" maxlength="500" placeholder="Great meeting you at..."></textarea></div>${icebreakerSection()}<label class="check"><input name="consent" type="checkbox" required><span>I agree to share these details with the card owner so they can contact me. The owner will receive my submission.</span></label>${!isDemo&&cfg.turnstileSiteKey?`<div class="cf-turnstile" data-sitekey="${esc(cfg.turnstileSiteKey)}"></div>`:''}<button class="btn block" type="submit">⇄ Exchange information</button><div id="exchange-feedback" aria-live="polite"></div></form>`}
function wireExchange(p,isDemo){wireIcebreaker();const form=document.getElementById('exchange-form');if(!form)return;form.onsubmit=async(e)=>{e.preventDefault();const msg=document.getElementById('exchange-feedback'),d=new FormData(form),btn=form.querySelector('button[type=submit]');if(!form.reportValidity())return;if(isDemo){msg.innerHTML='<div class="success">Demo complete! In the live app, this would securely send your details to the card owner.</div>';form.reset();wireIcebreaker();return}if(!configured){announce('Set up Supabase first');return}btn.disabled=true;msg.textContent='Sending…';try{const token=window.turnstile?.getResponse()||'';const response=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/exchange-contact',{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabaseAnonKey},body:JSON.stringify({username:p.username,name:d.get('name'),email:d.get('email'),phone:d.get('phone'),company:d.get('company'),message:d.get('message'),icebreaker_question:String(d.get('icebreaker_answer')||'').trim()?d.get('icebreaker_question'):'',icebreaker_answer:String(d.get('icebreaker_answer')||'').trim(),consent:d.get('consent')==='on',turnstileToken:token})});const json=await response.json().catch(()=>({}));if(!response.ok)throw Error(json.error||'Could not send contact information');msg.innerHTML='<div class="success">Details shared successfully! You can also save this person’s contact above.</div>';form.reset();wireIcebreaker();window.turnstile?.reset()}catch(err){msg.innerHTML=`<div class="error">${esc(err.message)}</div>`}finally{btn.disabled=false}}}
async function publicPage(username){
  render('<div class="loader">Loading card…</div>');
  if(!configured){render(`<main class="center-wrap"><div class="panel">Connect Supabase in <code>config.js</code> to open real public cards. <a href="#/demo">View demo →</a></div></main>`);return;}
  const {data,error}=await db.from('public_cards').select('*').eq('username',username).maybeSingle();
  if(error||!data){render('<main class="center-wrap"><div class="panel"><h2>Card not found</h2><p class="muted">This profile does not exist or is private.</p><a class="btn" href="#/">Back home</a></div></main>');return;}
  // The companion view only returns optional fields when the owner opted in,
  // and only for active published cards. An older deployment still shows its core card.
  let extras={};
  try{
    const {data:extra,error:extraError}=await db.from('public_card_extras')
      .select('personal_phone,additional_phone,work_address,show_personal_phone,show_additional_phone,show_work_address')
      .eq('username',username).maybeSingle();
    if(extraError)throw extraError;
    if(extra)extras=extra;
  }catch(e){console.warn('Optional public-card fields unavailable:',e.message);}
  const cardData={...data,...extras};
  render(`<main class="public-wrap public-three-column">${card(cardData)}<div class="panel" style="margin-bottom:18px"><h3 style="margin-bottom:13px">Scan or share</h3>${qrBlock(cardData)}</div><div class="panel form-section"><h3>Exchange contact information</h3><p class="hint" style="margin-top:8px">Send your details to ${esc(cardData.full_name||'the card owner')}. No account needed.</p>${exchangeForm(false)}</div></main>`);
  wireCard(cardData);drawQR(cardData);wireExchange(cardData,false);if(cfg.turnstileSiteKey)loadTurnstile();
}
function loadTurnstile(){if(document.querySelector('script[data-turnstile]')){window.turnstile?.render?.('.cf-turnstile');return}const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js';s.async=true;s.defer=true;s.dataset.turnstile='true';document.head.append(s)}
// Shared client-side guidance; Supabase must enforce its own matching password policy.
function loopPasswordChecks(value){return [value.length>=8,/[A-Z]/.test(value),/[a-z]/.test(value),/[0-9]/.test(value)];}
function loopPasswordValid(value){return loopPasswordChecks(value).every(Boolean);}
function loopPasswordFeedback(passwordId,confirmId,feedbackId){
  const password=document.getElementById(passwordId),confirm=confirmId?document.getElementById(confirmId):null,out=document.getElementById(feedbackId);
  if(!password||!out)return;
  function update(){
    const value=password.value,checks=loopPasswordChecks(value),count=checks.filter(Boolean).length;
    const labels=['8+ characters','Uppercase letter','Lowercase letter','One number'];
    let html='<p class="hint" style="margin:10px 0 6px">Password requirements</p>';
    html+='<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:10px;row-gap:6px">';
    html+=checks.map((ok,i)=>`<div class="hint" style="margin:0;font-size:12px;line-height:1.4;overflow-wrap:anywhere;color:${ok?'#18a078':'inherit'}">${ok?'✓':'○'} ${labels[i]}</div>`).join('');
    html+='</div>';
    const score=(!value)?'Not entered':count<2?'Weak':count<4?'Fair':value.length>=12?'Strong':'Good';
    html+=`<p class="hint" style="margin-top:9px">Strength: <strong>${score}</strong></p>`;
    if(confirm?.value)html+=`<p class="hint" style="margin-top:6px;color:${confirm.value===value?'#18a078':'#c24141'}">${confirm.value===value?'✓ Passwords match':'Passwords do not match'}</p>`;
    out.innerHTML=html;
  }
  password.addEventListener('input',update);if(confirm)confirm.addEventListener('input',update);update();
}
function loopTogglePassword(inputId,buttonId){
  const input=document.getElementById(inputId),button=document.getElementById(buttonId);if(!input||!button)return;
  button.addEventListener('click',()=>{
    const visible=input.type==='password';input.type=visible?'text':'password';
    button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'Hide password':'Show password');
    button.innerHTML=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${visible?'<path d="M3 3l18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-4 4.8M6.6 6.6C3.6 8.6 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.2-.9"/>':'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'}</svg>`;
  });
}
async function authPage(signup=false){if(me){location.hash=afterQuickQrLogin();return}const passwordUpdatedNotice=!signup&&route().path==='/auth'&&route().arg==='password-updated'?'<div class="success" role="status" aria-live="polite" style="margin:16px 0;padding:14px"><strong>Password updated successfully!</strong><p style="margin:6px 0 0">You can now sign in with your new password.</p></div>':'';render(`<main class="center-wrap"><div class="panel auth"><div class="brand"><img src="loop-logo.png" alt="the Loop logo" class="brand-logo">the Loop</div><h2>Welcome ${signup?'to the Loop':'back'}</h2><p class="muted">${signup?'Create an account to design and share your digital card.':'Log in to manage your digital card and contacts.'}</p>${!configured?'<div class="info-strip" style="margin-top:18px">Demo mode: add your Supabase URL and publishable key in config.js to activate accounts.</div>':''}${passwordUpdatedNotice}<div class="tabs"><button class="tab ${signup?'':'active'}" data-tab="login">Log in</button><button class="tab ${signup?'active':''}" data-tab="signup">Sign up</button></div><form class="form" id="auth-form">${signup?'<div class="field"><label>Full name</label><input name="name" autocomplete="name" required maxlength="100"></div>':''}<div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>${signup?'<div class="field"><label for="signup-email-confirm">Confirm Email</label><input id="signup-email-confirm" name="confirm_email" type="email" autocomplete="off" required></div>':''}<div class="field"><label>Password</label><div style="position:relative"><input id="auth-password" name="password" type="password" minlength="8" autocomplete="${signup?'new-password':'current-password'}" required style="width:100%;padding-right:52px"><button type="button" id="toggle-auth-password" aria-label="Show password" aria-pressed="false" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;cursor:pointer;padding:8px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>${signup?'<div id="signup-password-feedback" aria-live="polite"></div><div class="field"><label for="signup-password-confirm">Confirm Password</label><div style="position:relative"><input id="signup-password-confirm" name="confirm_password" type="password" minlength="8" autocomplete="new-password" required style="width:100%;padding-right:52px"><button type="button" id="toggle-signup-password-confirm" aria-label="Show password" aria-pressed="false" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;cursor:pointer;padding:8px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>':''}<button class="btn block" type="submit" ${configured?'':'disabled'}>${signup?'Create account':'Log in'}</button></form>${!signup?'<div style="margin:14px 0;text-align:center" class="hint">or</div><button type="button" class="btn secondary block" id="passkey-sign-in">Sign in with a passkey</button><button id="reset" class="btn ghost block" style="margin-top:10px">Forgot password?</button>':''}<div id="auth-message" aria-live="polite"></div></div></main>`);const togglePassword = document.getElementById('toggle-auth-password');
const passwordInput = document.getElementById('auth-password');

if (togglePassword && passwordInput) {
  togglePassword.onclick = () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    const eyeOpen = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
    const eyeClosed = '<path d="M3 3l18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-4 4.8M6.6 6.6C3.6 8.6 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.2-.9"/>';
    togglePassword.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (isHidden ? eyeClosed : eyeOpen) + '</svg>';
    togglePassword.setAttribute(
      'aria-label',
      isHidden ? 'Hide password' : 'Show password'
    );
    togglePassword.setAttribute('aria-pressed', String(isHidden));
  };
}if(signup){loopTogglePassword('signup-password-confirm','toggle-signup-password-confirm');loopPasswordFeedback('auth-password','signup-password-confirm','signup-password-feedback');}const passkeySignIn=document.getElementById('passkey-sign-in');if(passkeySignIn)passkeySignIn.onclick=async()=>{const btn=document.getElementById('passkey-sign-in'),status=document.getElementById('auth-message');btn.disabled=true;status.textContent='Waiting for your passkey…';try{if(!window.PublicKeyCredential||typeof db?.auth?.signInWithPasskey!=='function')throw Error('Passkey sign-in is unavailable on this browser.');const {data,error}=await db.auth.signInWithPasskey();if(error)throw error;me=data.user;location.hash=afterQuickQrLogin();}catch(e){status.textContent='Passkey sign-in failed: '+e.message;}finally{if(btn.isConnected)btn.disabled=false;}};document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>authPage(b.dataset.tab==='signup'));const r=document.getElementById('reset');if(r)r.onclick=async()=>{const email=document.querySelector('[name=email]').value.trim();if(!email){announce('Enter your email first');return}const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:resetUrl()});announce(error?error.message:'Check your email for a reset link')};document.getElementById('auth-form').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target),email=String(fd.get('email')||'').trim(),password=String(fd.get('password')||''),box=document.getElementById('auth-message');if(signup){if(email.toLowerCase()!==String(fd.get('confirm_email')||'').trim().toLowerCase()){box.innerHTML='<div class="error">Email addresses do not match.</div>';return}if(!loopPasswordValid(password)){box.innerHTML='<div class="error">Password must be at least 8 characters and contain uppercase, lowercase, and a number.</div>';return}if(password!==fd.get('confirm_password')){box.innerHTML='<div class="error">Passwords do not match.</div>';return}}box.textContent='Working…';let result=signup?await db.auth.signUp({email,password,options:{data:{full_name:fd.get('name'),loop_passkey_offer:true},emailRedirectTo:siteRoot()+'?page=confirmed'}}):await db.auth.signInWithPassword({email,password});if(result.error){
  const duplicateEmail=signup&&(result.error.code==='user_already_exists'||/user already registered|email already (registered|exists|in use)/i.test(result.error.message||''));
  if(duplicateEmail){
    box.innerHTML='<div class="error" role="alert"><strong>Email already registered</strong><p style="margin:8px 0 12px">This email already has a Loop account. Log in or reset your password.</p><div class="actions"><a class="btn" href="#/auth">Log In</a><button type="button" class="btn secondary" id="signup-existing-reset">Reset Password</button></div><p class="hint" id="signup-existing-reset-status" role="status" style="margin-top:10px"></p></div>';
    document.getElementById('signup-existing-reset').onclick=async()=>{
      const button=document.getElementById('signup-existing-reset'),status=document.getElementById('signup-existing-reset-status');
      button.disabled=true;status.textContent='Sending password-reset email…';
      try{const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:resetUrl()});if(error)throw error;status.textContent='If this account can receive password resets, check its email for the link.';}
      catch(err){status.textContent='Could not send reset email: '+err.message;}
      finally{button.disabled=false;}
    };
  }else box.innerHTML=`<div class="error">${esc(result.error.message)}</div>`;
  return;
}if(signup&&!result.data.session){box.innerHTML='<div class="success" role="status"><strong>Check your email</strong><p style="margin:8px 0">We sent a confirmation link if this email address is eligible for registration. After confirming, log in to the Loop.</p></div>';return}me=result.data.user;location.hash=afterQuickQrLogin()}}
async function getMyProfile(){let {data,error}=await db.from('profiles').select('*').eq('id',me.id).maybeSingle();if(error)throw error;if(data)return data;const name=me.user_metadata?.full_name||'',fallback=('user'+me.id.replace(/-/g,'').slice(0,9));const {data:newData,error:insertError}=await db.from('profiles').insert({id:me.id,username:fallback,full_name:name,email:me.email||''}).select().single();if(insertError)throw insertError;return newData}
const THEMES=['violet','ocean','emerald','sunset','rose','midnight','executive-navy','graphite','slate','forest','champagne','burgundy','ivory','steel-blue','espresso','teal-professional'];
// Keep the already-published username immutable in the edit UI so links/QRs stay stable.
// Only full name and title/credentials are required. Existing email/phone columns
// are now clearly labelled WORK contact details and preserve their visibility controls.
const fields=[
 ['full_name','Full Name','text',true],
 ['title','Job Title / Credentials','text',true],
 ['company','Company / Organization','text',false],
 ['email','Work Email','email',false],
 ['phone','Work Phone Number','tel',false],
 ['bio','Bio','textarea',false],
 ['linkedin','LinkedIn','url',false],
 ['personal_phone','Personal Phone Number','tel',false],
 ['additional_phone','Additional Public Phone Number','tel',false],
 ['work_address','Work Address','textarea',false],
 ['website','Website','url',false]
];
const profileFieldPlaceholder={
 full_name:'Enter your full name',title:'e.g. Registered Nurse, BSN, PCCN',
 company:'Company or organization (optional)',email:'name@company.com',phone:'Work phone (optional)',
 bio:'Tell people a little about yourself (500 characters max)',linkedin:'https://linkedin.com/in/…',
 personal_phone:'Personal number (private by default)',additional_phone:'Another number (private by default)',
 work_address:'Your office or workplace address',website:'https://yourwebsite.com'
};
function profileField(p,key){
  const field=fields.find(([id])=>id===key);
  const [,label,type,required]=field;
  const max=key==='bio'?500:key==='work_address'?300:key.includes('phone')?40:300;
  const hint=profileFieldPlaceholder[key]||'';
  const autocomplete={full_name:'name',email:'email',phone:'tel',personal_phone:'tel',company:'organization',website:'url'}[key]||'off';
  return `<div class="field" style="min-width:0"><label for="f-${key}">${esc(label)}${required?' <span aria-label="required" style="color:#9b89ff">*</span>':''}</label>${type==='textarea'?`<textarea id="f-${key}" name="${key}" maxlength="${max}" placeholder="${esc(hint)}" rows="${key==='bio'?3:2}" ${required?'required':''}>${esc(p[key]||'')}</textarea>`:`<input id="f-${key}" name="${key}" type="${type}" maxlength="${max}" autocomplete="${autocomplete}" placeholder="${esc(hint)}" value="${esc(p[key]||'')}" ${required?'required':''}>`}</div>`;
}
function themeSelector(p){return `<div class="wide theme-editor"><label>Card color theme</label><div class="theme-options">${THEMES.map(t=>`<label class="theme-pick"><input type="radio" name="theme" value="${t}" ${((p.theme||'violet')===t)?'checked':''}><span class="theme-dot theme-${t}"></span><span class="theme-name">${t.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}</span></label>`).join('')}</div><p class="hint">Choose a color to preview it on your card.</p><div id="theme-preview">${card(p)}</div></div>`}
function photoPicker(p){return `<div class="wide photo-editor"><label>Profile picture</label><div class="photo-actions"><button type="button" class="btn secondary" id="choose-photo">Upload photo</button><button type="button" class="btn secondary" id="take-photo">Take a photo</button><button type="button" class="btn secondary" id="edit-photo" ${p.photo_url?'':'disabled'}>Crop / edit photo</button><button type="button" class="btn ghost" id="remove-photo">Remove photo</button></div><input hidden type="file" id="photo-input" accept="image/*"><input hidden type="file" id="camera-input" accept="image/*" capture="user"><input type="hidden" id="f-photo_url" name="photo_url" value="${esc(p.photo_url||'')}"><p class="hint" id="photo-message">JPG, PNG, or WebP, up to 8 MB. Crop and adjust before uploading. Photos are stored in a public profile-photo bucket.</p><div class="photo-preview" id="photo-preview">${avatar(p)}</div><div class="crop-editor" id="crop-editor" hidden><h3>Crop your profile photo</h3><p class="hint">Drag the picture to reposition it, then adjust the zoom. The circular guide shows what your profile photo will look like.</p><div class="crop-stage" id="crop-stage"><canvas id="crop-canvas" width="320" height="320" aria-label="Crop photo preview"></canvas></div><label class="crop-zoom-label" for="crop-zoom">Zoom <input id="crop-zoom" type="range" min="1" max="3" step="0.01" value="1"></label><div class="crop-actions"><button class="btn" type="button" id="apply-crop">Apply crop</button><button class="btn secondary" type="button" id="cancel-crop">Cancel</button></div></div></div>`}
function profileForm(p){
  const professional=['full_name','title','company','email','phone'];
  const optional=['bio','linkedin','personal_phone','additional_phone','work_address','website'];
  const gridStyle='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,255px),1fr));gap:16px';
  const check=(key,text)=>`<label class="check" style="margin:5px 0"><input type="checkbox" name="${key}" ${p[key]?'checked':''}><span>${text}</span></label>`;
  return `<form class="profile-form" id="profile-form">
    <section class="wide" style="grid-column:1/-1">
      <h3 style="margin-bottom:8px">Professional Information</h3>
      <p class="hint" style="margin:0 0 18px">Only fields marked <strong>*</strong> are required. Add the rest whenever you're ready.</p>
      <div style="${gridStyle}">${professional.map(key=>profileField(p,key)).join('')}</div>
    </section>
    <details class="wide" id="loop-additional-info" style="grid-column:1/-1;border:1px solid var(--line,#dbe2ea);border-radius:14px;padding:0 16px;margin:4px 0 10px">
      <summary style="cursor:pointer;padding:17px 2px;font-weight:650;list-style:revert;">Additional Information (Optional)<span class="hint" style="display:block;font-weight:400;margin-top:4px">Personalize your card with more details</span></summary>
      <div style="${gridStyle};padding:4px 0 20px">${optional.map(key=>profileField(p,key)).join('')}</div>
    </details>
    <section class="wide" style="grid-column:1/-1">${photoPicker(p)}</section>
    <section class="wide" style="grid-column:1/-1">${themeSelector(p)}</section>
    <section class="wide" style="grid-column:1/-1;border-top:1px solid var(--line,#dbe2ea);padding-top:18px">
      <h3 style="margin-bottom:7px">Contact Visibility & Privacy</h3>
      <p class="hint" style="margin:0 0 14px">Contact numbers and addresses are hidden on your public card until you choose to show them. Your public name, title and organization remain visible when your card is published.</p>
      ${check('show_email','Show work email on my public card')}
      ${check('show_phone','Show work phone on my public card')}
      ${check('show_personal_phone','Show personal phone on my public card')}
      ${check('show_additional_phone','Show additional phone on my public card')}
      ${check('show_work_address','Show work address on my public card')}
      <div style="margin-top:14px">${check('published','Publish my card so anyone with my link can view the details I choose to share.')}</div>
    </section>
    <div class="wide" style="grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px">
      <button type="button" id="reset-profile" class="btn secondary">Reset</button>
      <button type="button" id="cancel-profile" class="btn secondary">Cancel</button>
      <button type="submit" class="btn">Save Changes</button>
      <span id="save-message" role="status" aria-live="polite" class="hint"></span>
    </div>
  </form>`;
}
function wireProfileEditor(){
 const form=document.getElementById('profile-form'),draft={...profile},themePreview=document.getElementById('theme-preview');
 document.getElementById('reset-profile').onclick=()=>{view='edit';showDashboard();announce('Unsaved changes reset to your last saved card.');};
 document.getElementById('cancel-profile').onclick=()=>{view='overview';showDashboard();window.scrollTo({top:0,behavior:'smooth'});};
 // Browser validation must expand the optional panel before focusing an invalid URL.
 form.addEventListener('invalid',event=>{const optional=document.getElementById('loop-additional-info');if(optional?.contains(event.target))optional.open=true;},true);
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
async function dashboard(){if(!configured){authPage();return}if(!me){location.hash='/auth';return}render('<div class="loader">Loading your dashboard…</div>');try{profile=await getMyProfile()}catch(e){render(`<main class="center-wrap"><div class="panel"><h2>Unable to load profile</h2><p class="error">${esc(e.message)}</p><p class="hint">Did you run schema.sql in your Supabase SQL editor?</p></div></main>`);return}if(profile.deactivated_at){showReactivationPage();return}if(pendingMobileView){view=pendingMobileView;pendingMobileView=null}showDashboard()}
// Email signatures are generated locally from the owner's existing profile.
// Email clients vary in image handling; a clickable card link is always included.
function signatureParts(p, includePhoto, includeQR){
 const name=String(p.full_name||'').trim();
 const title=String(p.title||'').trim();
 const company=String(p.company||'').trim();
 const link=urlFor(p.username);
 const photo=includePhoto&&safeUrl(p.photo_url)?safeUrl(p.photo_url):'';
 const email=p.show_email&&p.email?String(p.email):'';
 const phone=p.show_phone&&p.phone?String(p.phone):'';
 const personalPhone=p.show_personal_phone&&p.personal_phone?String(p.personal_phone):'';
 const otherPhone=p.show_additional_phone&&p.additional_phone?String(p.additional_phone):'';
 const workAddress=p.show_work_address&&p.work_address?String(p.work_address):'';
 const lines=[name,[title,company].filter(Boolean).join(' | '),email,phone,personalPhone,otherPhone,workAddress,link,'Meet. Connect. Stay in the Loop.'].filter(Boolean);
 const plain=lines.join('\n');
 const website=safeUrl(p.website),linkedin=safeUrl(p.linkedin);
 const qr=includeQR?document.getElementById('qr-canvas')?.toDataURL('image/png'):'';
 const image=photo?`<td style="padding:0 14px 0 0;vertical-align:top"><img src="${esc(photo)}" alt="" width="68" height="68" style="border-radius:10px;object-fit:cover;width:68px;height:68px"></td>`:'';
 const links=[email?`<a href="mailto:${esc(encodeURIComponent(email))}" style="color:#334155;text-decoration:none">${esc(email)}</a>`:'',phone?`<a href="tel:${esc(phone.replace(/[^+\d]/g,''))}" style="color:#334155;text-decoration:none">${esc(phone)}</a>`:'',personalPhone?`<a href="tel:${esc(personalPhone.replace(/[^+\d]/g,''))}" style="color:#334155;text-decoration:none">${esc(personalPhone)}</a>`:'',otherPhone?`<a href="tel:${esc(otherPhone.replace(/[^+\d]/g,''))}" style="color:#334155;text-decoration:none">${esc(otherPhone)}</a>`:'',workAddress?`<span>${esc(workAddress)}</span>`:'',website?`<a href="${esc(website)}" style="color:#334155">Website</a>`:'',linkedin?`<a href="${esc(linkedin)}" style="color:#334155">LinkedIn</a>`:''].filter(Boolean).join(' &nbsp;·&nbsp; ');
 const qrCell=qr?`<td style="padding:0 0 0 12px;vertical-align:top"><a href="${esc(link)}"><img src="${qr}" alt="Scan my digital business card" width="84" height="84" style="display:block;width:84px;height:84px"></a></td>`:'';
 const html=`<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;color:#243449;border-collapse:collapse"><tr>${image}<td style="vertical-align:top"><div style="font-size:17px;font-weight:700;color:#243449">${esc(name)}</div><div style="font-size:13px;color:#475569;padding-top:3px">${esc([title,company].filter(Boolean).join(' | '))}</div>${links?`<div style="font-size:12px;padding-top:8px">${links}</div>`:''}<div style="padding-top:10px;font-size:13px"><a href="${esc(link)}" style="font-weight:700;color:#3551a2;text-decoration:underline">View my digital business card</a></div><div style="font-size:11px;color:#64748b;padding-top:7px">Meet. Connect. Stay in the Loop.</div></td>${qrCell}</tr></table>`;
 return {html,plain};
}
function showSignatureGenerator(){
 const el=document.getElementById('dash-body');
 el.innerHTML=`<div class="panel" style="max-width:850px"><h2 style="margin-bottom:8px">Create your email signature</h2><p class="hint" style="margin-bottom:18px">Use your Loop profile in Outlook, Gmail, or other email apps. Only contact details you have chosen to make public are included.</p><label class="check" style="margin-bottom:12px"><input id="signature-photo" type="checkbox" ${profile.photo_url?'checked':''} ${profile.photo_url?'':'disabled'}> Include profile photo</label><label class="check" style="margin-bottom:12px"><input id="signature-qr" type="checkbox"> Include QR code (uses a publicly accessible QR image)</label><div id="signature-preview" style="padding:20px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#243449;margin:18px 0;overflow-wrap:anywhere"></div><div class="actions"><button class="btn" id="signature-copy" type="button">Copy email signature</button><button class="btn secondary" id="signature-copy-text" type="button">Copy text version</button></div><p class="hint" style="margin-top:14px">On mobile: Copy your signature, long-press inside your email app, then tap Paste to keep formatting and the QR code when supported. Avoid the keyboard clipboard-history button.</p></div>`;
 const photo=document.getElementById('signature-photo'),qr=document.getElementById('signature-qr'),preview=document.getElementById('signature-preview');
 // QR source is generated from the same local QR library as Share & QR; never sent to a third party.
 let qrCanvas=null;
 if(typeof window.qrcode==='function'){
  try{const q=window.qrcode(0,'M');q.addData(urlFor(profile.username));q.make();const n=q.getModuleCount(),m=4,c=4;qrCanvas=document.createElement('canvas');qrCanvas.width=qrCanvas.height=(n+2*m)*c;const ctx=qrCanvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,qrCanvas.width,qrCanvas.height);ctx.fillStyle='#182335';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))ctx.fillRect((x+m)*c,(y+m)*c,c,c);}catch{qr.disabled=true;}
 }else qr.disabled=true;
 // Preview the QR locally, but use a hosted HTTPS PNG in the copied email signature.
 // The public profile-photos bucket already restricts uploads to each owner's UUID folder.
 const copyButton=document.getElementById('signature-copy');
 let hostedQR='', qrUploadPromise=null;
 const qrImage=(src)=>`<td style="padding-left:12px;vertical-align:top"><a href="${esc(urlFor(profile.username))}"><img src="${esc(src)}" alt="My Loop QR" width="84" height="84" style="display:block;width:84px;height:84px;border:0"></a></td>`;
 const generate=(forEmail=false)=>{
  const {html,plain}=signatureParts(profile,photo.checked,false);
  if(!qr.checked||!qrCanvas)return {html,plain};
  const imageUrl=forEmail?hostedQR:(hostedQR||qrCanvas.toDataURL('image/png'));
  if(!imageUrl)return {html,plain};
  return {html:html.replace('</tr></table>',qrImage(imageUrl)+'</tr></table>'),plain};
 };
 const update=()=>{preview.innerHTML=generate().html;};
 const prepareHostedQR=async()=>{
  if(hostedQR)return hostedQR;
  if(qrUploadPromise)return qrUploadPromise;
  if(!db||!me||!qrCanvas)throw Error('Sign in to add a QR image.');
  copyButton.disabled=true;
  copyButton.textContent='Preparing QR image…';
  qrUploadPromise=(async()=>{
   const blob=await new Promise((resolve,reject)=>qrCanvas.toBlob(b=>b?resolve(b):reject(Error('QR image could not be created.')),'image/png'));
   // Deterministic name: existing signatures keep working instead of uploading duplicates.
   const path=`${me.id}/loop-email-qr-${profile.username}.png`;
   const {error}=await db.storage.from('profile-photos').upload(path,blob,{contentType:'image/png',upsert:false,cacheControl:'3600'});
   // A previous copy may have created this exact PNG already.
   if(error && String(error.statusCode)!=='409' && !/already exists|duplicate/i.test(error.message||''))throw error;
   const {data}=db.storage.from('profile-photos').getPublicUrl(path);
   if(!safeUrl(data?.publicUrl))throw Error('Could not obtain a public QR image URL.');
   hostedQR=data.publicUrl;
   return hostedQR;
  })();
  try{return await qrUploadPromise;}
  finally{qrUploadPromise=null;copyButton.disabled=false;copyButton.textContent='Copy email signature';update();}
 };
 photo.onchange=update;
 qr.onchange=()=>{
  update();
  if(qr.checked&&!hostedQR){
   prepareHostedQR().catch(e=>{qr.checked=false;update();announce('Could not prepare QR image: '+e.message);});
  }
 };
 update();
 document.getElementById('signature-copy').onclick=async()=>{
  if(qr.checked&&!hostedQR){announce('QR image is still preparing. Please try again.');return;}
  const {html,plain}=generate(true);
  try{
   if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw Error('Rich clipboard unavailable');
   await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);
   announce('Signature copied! Paste into your email signature settings.');
  }catch{announce('Rich copy unavailable. Try Chrome on desktop or use Copy text version.');}
 };
 document.getElementById('signature-copy-text').onclick=()=>copy(generate().plain);
}
// New signups get a one-time, optional passkey prompt after verified sign-in.
// A signed-in session and a direct user click are required for WebAuthn registration.
function showPasskeyOnboarding(){
 if(!db||!me?.email_confirmed_at||!me?.user_metadata?.loop_passkey_offer||profile?.deactivated_at)return;
 document.getElementById('loop-passkey-onboarding')?.remove();
 const overlay=document.createElement('div');
 overlay.id='loop-passkey-onboarding';
 overlay.style.cssText='position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(13,21,36,.68);';
 overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="loop-passkey-title" aria-describedby="loop-passkey-description" style="width:100%;max-width:430px;box-sizing:border-box;background:var(--surface,#fff);color:var(--ink,#182335);background:#fff;color:#182335;border-radius:20px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.25);text-align:center;">
   <div aria-hidden="true" style="font-size:38px;line-height:1.2;margin-bottom:12px">🔐</div>
   <h2 id="loop-passkey-title" style="font-size:24px;margin:0 0 12px;color:#182335">Set up your passkey</h2>
   <p id="loop-passkey-description" style="margin:0 0 22px;color:#475569;line-height:1.5">Your email is verified. Add a passkey to sign in faster using Face ID, your fingerprint, or your device screen lock.</p>
   <button type="button" class="btn block" id="loop-passkey-now">Set Up Passkey</button>
   <button type="button" class="btn ghost block" id="loop-passkey-later" style="margin-top:10px">Maybe Later</button>
   <p class="hint" id="loop-passkey-onboarding-status" role="status" aria-live="polite" style="margin-top:12px;color:#475569"></p>
   <p style="margin:10px 0 0;font-size:12px;color:#64748b">Optional · You can always add a passkey under Settings.</p>
  </section>`;
 document.body.append(overlay);
 const now=document.getElementById('loop-passkey-now');
 const later=document.getElementById('loop-passkey-later');
 const status=document.getElementById('loop-passkey-onboarding-status');
 const dismiss=async()=>{
  const {data,error}=await db.auth.updateUser({data:{loop_passkey_offer:false}});
  if(error)throw error;
  if(data?.user)me=data.user;
  overlay.remove();
 };
 now.onclick=async()=>{
  now.disabled=true;later.disabled=true;status.textContent='Waiting for your device…';
  try{
   if(!window.PublicKeyCredential||typeof db.auth.registerPasskey!=='function')throw Error('Passkey setup is not supported by this browser. You can set it up later in Settings.');
   const {error}=await db.auth.registerPasskey();
   if(error)throw error;
   status.textContent='Passkey added. Finishing setup…';
   await dismiss();
   announce('Passkey created! You can now sign in using your device.');
  }catch(e){status.textContent='Could not complete passkey setup: '+e.message;}
  finally{if(overlay.isConnected){now.disabled=false;later.disabled=false;}}
 };
 later.onclick=async()=>{
  now.disabled=true;later.disabled=true;status.textContent='Saving your preference…';
  try{await dismiss();announce('You can set up a passkey anytime in Settings.');}
  catch(e){status.textContent='Could not save your preference: '+e.message;now.disabled=false;later.disabled=false;}
 };
 now.focus();
}

function wirePersonalQrLink(){
 const personalQrLink=document.getElementById('open-personal-my-qr');
 if(personalQrLink)personalQrLink.onclick=()=>{try{localStorage.setItem(MY_QR_LAST_KEY,profile.username);}catch{}};
}
function wireGoogleWalletButton(){
const walletButton=document.getElementById('add-to-google-wallet');
if(walletButton){walletButton.onclick=async()=>{
  const status=document.getElementById('google-wallet-status');
  const originalButtonLabel=walletButton.textContent;
  walletButton.disabled=true;walletButton.textContent='Preparing Wallet card…';status.textContent='';
  try{
    if(!db||!me)throw Error('Please sign in first.');
    if(!profile.published||profile.deactivated_at)throw Error('Publish and activate your Loop card first.');
    const {data,error}=await db.functions.invoke('google-wallet-pass',{method:'POST',body:{}});
    if(error){
      let message=error.message||'Wallet service unavailable.';
      const response=error.context;
      if(response&&typeof response.json==='function'){
        const details=await response.clone().json().catch(()=>null);
        if(details?.error)message=details.error;
      }
      throw Error(message);
    }
    if(data?.error)throw Error(String(data.error));
    const link=data?.url;
    if(typeof link!=='string'||!/^https:\/\/pay\.google\.com\/gp\/v\/save\/[A-Za-z0-9._-]+$/.test(link)){
      throw Error('Google Wallet returned an invalid link.');
    }
    status.textContent='Opening Google Wallet…';
    window.location.assign(link);
  }catch(e){
    status.textContent='Could not open Google Wallet: '+(e?.message||'Please try again.');
  }finally{
    if(walletButton.isConnected){walletButton.disabled=!profile.published;walletButton.textContent=originalButtonLabel;}
  }
};}
}

function showDashboard(){render(`<style>
/* Desktop: section headings read as muted dividers, never as buttons. */
.loop-side-menu .loop-side-heading { display:flex; align-items:center; gap:9px; font-size:10px; font-weight:700; letter-spacing:1.4px; color:var(--muted,#64748b); padding:17px 12px 7px; text-transform:uppercase; pointer-events:none; user-select:none; }
.loop-side-menu .loop-side-heading::after { content:""; flex:1 1 auto; border-top:1px solid var(--line,#dbe2ea); }
.loop-side-menu .loop-side-heading:first-child { padding-top:3px; }
/* Mobile's horizontal action strip must contain actions only—not section labels. */
@media (max-width: 1024px) {
  .loop-side-menu .loop-side-heading { display:none !important; }
  .loop-side-menu button.loop-nav-group-start { margin-left:12px; }
}
</style><main class="shell layout"><aside class="side loop-side-menu">${[
  ['CARD ACTIONS', [['overview','⌂ My Account'],['edit','✎ Edit My Card'],['share','▦ Share My Digital Card'],['contacts','⇄ My Connections']]],
  ['SPECIAL FEATURES', [['qr-shortcut',isMobileDevice()?'⌂ Add My QR Code to Home Screen':'⌂ Add My QR Code to Desktop'],['wallet','▣ Add My Card to Google Wallet']]],
  ['', [['signature','✉ Create Email Signature'],['demo','↗ Explore the Demo'],['settings','⚙ Settings']]]
 ].map(([section,items])=>`${section?`<div class="loop-side-heading" aria-hidden="true">${section}</div>`:''}${items.map(([v,label],i)=>`<button ${v==='demo'?'data-open-demo':'data-view="'+v+'"'} class="${view===v?'active':''}${i===0 && section!=='CARD ACTIONS'?' loop-nav-group-start':''}">${label}${v==='contacts'?'<span class="connection-badge" data-unread-count hidden></span>':''}</button>`).join('')}`).join('')}</aside><section><div class="top-row"><div><h1>${({overview:'My Account',edit:'Edit your card',share:'Share Your Digital Business Card','qr-shortcut':isMobileDevice()?'Add My QR Code to Home Screen':'Add My QR Code to Desktop',wallet:'Add My Card to Google Wallet',signature:'Email Signature Generator',contacts:'Your connections',settings:'Settings'})[view]}</h1><p>Welcome${profile.full_name?', '+esc(profile.full_name.split(' ')[0]):''}. Your network starts here.</p></div>${profile.published?`<a href="#/u/${encodeURIComponent(profile.username)}" class="btn secondary small">View public card ↗</a>`:'<span class="hint">Card is private</span>'}</div><div id="dash-body"></div></section></main>`);document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;showDashboard()});const demoLink=document.querySelector('[data-open-demo]');if(demoLink)demoLink.onclick=()=>{location.hash='/demo';};const el=document.getElementById('dash-body');if(view==='overview'){el.innerHTML=`<div class="dashboard-grid"><div class="panel"><h2 style="font-size:20px;margin-bottom:10px">Your digital identity</h2><p class="muted" style="margin-bottom:20px">Keep your card current and share it anywhere.</p>${card(profile)}</div><div class="panel"><h3 style="margin-bottom:16px">Quick share</h3>${qrBlock(profile)}<p class="hint" style="margin-top:16px">${profile.published?'Your card is public.':'Publish your card in Edit card before sharing.'}</p></div></div>`;wireCard(profile);drawQR(profile);}else if(view==='edit'){el.innerHTML=`<div class="panel"><div class="info-strip" style="margin-bottom:20px">Only publish information you're comfortable sharing publicly. Your personal card link and QR code stay the same.</div>${profileForm(profile)}</div>`;document.getElementById('profile-form').onsubmit=saveProfile;wireProfileEditor()}else if(view==='share'){el.innerHTML=`<div class="dashboard-grid" style="grid-template-columns:minmax(0,1fr)"><div class="panel"><h2 style="font-size:19px">Your QR code</h2><p class="hint" style="margin:8px 0 20px">Let others scan your QR code to instantly view and save your contact information.</p>${qrBlock(profile)}<div class="actions"><button class="btn" data-action="native-share">↗ Share card</button><button class="btn secondary" data-action="share-by-email">✉ Email card</button><button class="btn secondary" id="share-qr-image">↗ Share QR image</button><button class="btn secondary" id="download-qr">↓ Download QR</button></div>${!profile.published?'<p class="error">Your card is currently private. Publish it in Edit card before sharing.</p>':''}</div></div><div class="panel" style="margin-top:18px"><h3 style="margin-bottom:8px">Keep Your QR Code One Tap Away</h3><p class="hint" style="margin-bottom:14px">Save your personal QR code to your Home Screen or computer desktop, so you can show it instantly without signing in.</p><a class="btn secondary" href="#/my-qr/u/${encodeURIComponent(profile.username)}" id="open-personal-my-qr" style="max-width:100%">⌂ Add My QR Code to Home Screen →</a></div><div class="panel" style="margin-top:18px"><h3 style="margin-bottom:8px">Add your card to Google Wallet</h3><p class="hint" style="margin-bottom:14px">Keep your Loop card handy on your phone. Your Wallet QR code will open your live digital card when someone scans it.</p><button type="button" class="btn secondary" id="add-to-google-wallet" ${profile.published?'':'disabled'}>▣ Add to Google Wallet</button><p id="google-wallet-status" role="status" aria-live="polite" class="hint" style="margin-top:10px"></p><p class="hint" style="margin-top:8px">Google Wallet passes can currently be saved only by approved test accounts.</p></div>`;wireCard(profile);
drawQR(profile);
const shareQR = document.getElementById('qr-canvas');
if (shareQR) {
  shareQR.style.width = 'min(100%, 320px)';
  shareQR.style.height = 'auto';
  shareQR.style.maxWidth = '320px';
}
wirePersonalQrLink();
wireGoogleWalletButton();
document.querySelector('[data-action="share-by-email"]').onclick=()=>{const subject=`${profile.full_name||'My'} digital business card | the Loop`;const body=`Hello,\n\nHere is my digital business card:\n${profile.full_name||''}${profile.title?' — '+profile.title:''}\n${urlFor(profile.username)}\n\nScan the QR code shown on my card page, or open the link above to save my contact information.\n\nBest regards,\n${profile.full_name||''}`;window.location.href=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;};document.getElementById('share-qr-image').onclick=async()=>{const canvas=document.getElementById('qr-canvas');if(!canvas||!canvas.width){announce('QR code is not ready');return}const base64=canvas.toDataURL('image/png').split(',')[1];const binary=atob(base64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const file=new File([bytes],'the-loop-qr.png',{type:'image/png'});if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({title:`${profile.full_name} | the Loop`,text:`My digital business card: ${urlFor(profile.username)}`,files:[file]});return}catch(err){if(err.name==='AbortError')return;}}const a=document.createElement('a');a.download='the-loop-qr.png';a.href=canvas.toDataURL('image/png');a.click();announce('QR image downloaded. Attach it to your email manually.');};document.getElementById('download-qr').onclick=()=>{const canvas=document.getElementById('qr-canvas');if(!canvas)return;const a=document.createElement('a');a.download='the-loop-qr.png';a.href=canvas.toDataURL('image/png');a.click()}}else if(view==='qr-shortcut'){
 el.innerHTML=`<div class="panel" style="max-width:760px;padding:clamp(20px,4vw,32px)">
   <h2 style="margin-bottom:12px">${isMobileDevice()?'Your personal QR, one tap away':'Your personal QR, one click away'}</h2>
   <p class="muted" style="line-height:1.7;margin-bottom:18px">Save a shortcut that opens <strong>your personal Loop QR code</strong>, so someone can scan it to view your live digital business card. Once set up, you can open the shortcut without signing in.</p>
   ${profile.published?`<a class="btn" id="open-personal-my-qr" href="#/my-qr/u/${encodeURIComponent(profile.username)}" style="max-width:100%">${isMobileDevice()?'⌂ Add My QR Code to Home Screen':'▣ Add My QR Code to Desktop'} →</a>`:`<p class="error">Your digital card is private. Publish it in Edit Card before creating a public QR shortcut.</p><button class="btn" disabled>Publish your card first</button>`}
   <p class="hint" style="margin-top:16px">${isMobileDevice()?'Works with supported iPhone and Android home-screen shortcuts.':'Works with supported desktop browsers; you can save a shortcut or install when available.'} Your shortcut leads to your QR, not someone else's card.</p>
 </div>`;
 wirePersonalQrLink();
}else if(view==='wallet'){
 el.innerHTML=`<div class="panel" style="max-width:760px;padding:clamp(20px,4vw,32px)">
   <h2 style="margin-bottom:12px">Save your Loop card to Google Wallet</h2>
   <p class="muted" style="line-height:1.7;margin-bottom:18px">Add a QR pass to <strong>Google Wallet</strong> so you can pull up your live digital card quickly on a supported Android phone. Anyone who scans it can open your public Loop card.</p>
   <button type="button" class="btn" id="add-to-google-wallet" ${profile.published?'':'disabled'}>▣ Add My Card to Google Wallet</button>
   <p id="google-wallet-status" role="status" aria-live="polite" class="hint" style="margin-top:12px"></p>
   ${!profile.published?'<p class="error" style="margin-top:12px">Publish your digital card in Edit Card before adding it to Google Wallet.</p>':''}
   <p class="hint" style="margin-top:18px">Google Wallet passes are available to approved test accounts. Google Wallet is separate from iPhone Apple Wallet.</p>
 </div>`;
 wireGoogleWalletButton();
}else if(view==='signature'){showSignatureGenerator()}else if(view==='settings'){showSettingsPage()}else if(view==='contacts'){el.innerHTML='<div class="panel"><h3>People who exchanged details with you</h3><p class="hint" style="margin-top:8px">Private to your account.</p><div class="connections-toolbar"><button type="button" class="btn secondary small" id="select-all-connections">☑ Select All</button><button type="button" class="btn secondary small" id="clear-connection-selection">Clear</button><button type="button" class="btn secondary small" id="export-selected-csv" disabled>↓ Download CSV</button><button type="button" class="btn secondary small" id="print-selected-connections" disabled>▤ Print / PDF</button><button type="button" class="btn secondary small connection-delete-button" id="delete-selected-connections" disabled>Delete</button><span id="connection-selection-count" class="hint" aria-live="polite">0 selected</span></div><div class="contact-search-row"><label for="contact-search">Search your connections</label><input id="contact-search" type="search" placeholder="Search name, email, phone, company…" autocomplete="off" aria-controls="contacts-list"><p id="contact-count" class="contact-count" aria-live="polite"></p></div><div id="contacts-list" class="loader">Loading connections…</div></div>';loadContacts()}showPasskeyOnboarding();}

function showReactivationPage(){
 render(`<main class="center-wrap"><div class="panel auth"><h2>Your account is deactivated</h2><p class="muted" style="margin:12px 0 20px">Your digital card is hidden and new contact exchanges are paused. Your profile and saved connections are still here.</p><button type="button" class="btn block" id="reactivate-account">Reactivate Account</button><button type="button" class="btn secondary block" id="reactivate-logout" style="margin-top:10px">Log out</button><p id="reactivate-status" role="status" class="hint" style="margin-top:12px"></p></div></main>`);
 document.getElementById('reactivate-logout').onclick=async()=>{await db.auth.signOut();me=null;profile=null;location.hash='/';};
 document.getElementById('reactivate-account').onclick=async()=>{
  const btn=document.getElementById('reactivate-account'),status=document.getElementById('reactivate-status');btn.disabled=true;status.textContent='Reactivating…';
  try{const {error}=await db.rpc('set_my_account_active',{p_active:true});if(error)throw error;profile=await getMyProfile();if(profile.deactivated_at)throw Error('Account status could not be confirmed.');view='overview';showDashboard();announce('Your Loop account has been reactivated.');}
  catch(err){status.textContent='Unable to reactivate: '+err.message;btn.disabled=false;}
 };
}

function showSettingsPage(){
 const el=document.getElementById('dash-body');
 el.innerHTML=`<div class="panel" style="max-width:850px"><h2>Account Security</h2><p class="hint" style="margin:8px 0 20px">Manage how you sign in to the Loop.</p><div class="panel" style="margin-bottom:16px"><h3>Passkey Login</h3><p class="hint" style="margin:8px 0 14px">Use your fingerprint, Face ID, or device screen lock. Your biometrics stay on your device.</p><button type="button" class="btn" id="setup-passkey">Set Up Passkey</button><p id="passkey-status" class="hint" role="status" style="margin-top:12px"></p></div><div class="panel"><h3>Password</h3><p class="hint" style="margin:8px 0 14px">Email yourself a secure link to change your account password.</p><button type="button" class="btn secondary" id="change-password">Change Password</button><p id="password-status" class="hint" role="status" style="margin-top:12px"></p></div><h2 style="margin:28px 0 14px">Account Management</h2><div class="panel" style="margin-bottom:16px"><h3>Deactivate Account</h3><p class="hint" style="margin:8px 0 14px">Hide your public card and stop new contact exchanges. Your profile and connections are preserved. You can reactivate by signing in again.</p><button type="button" class="btn secondary" id="deactivate-account">Deactivate Account</button><p id="deactivate-status" class="hint" role="status" style="margin-top:12px"></p></div><div class="panel"><h3>Delete Account</h3><p class="hint" style="margin:8px 0 14px">Permanently remove your account, digital card, saved connections, uploaded photos, and login credentials. This cannot be undone. Unlike deactivation, deletion is permanent.</p><button type="button" class="btn secondary" id="delete-account-request">Request Deletion Code</button><p id="delete-account-status" role="status" class="hint" style="margin-top:12px"></p><div id="delete-account-verify" hidden style="margin-top:14px;padding:16px;border:1px solid var(--line,#dbe2ea);border-radius:12px"><p class="hint" style="margin-bottom:12px">Check your verified login email for an 8-digit code. It expires in 10 minutes.</p><div class="field"><label for="delete-account-code">8-digit verification code</label><input id="delete-account-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" placeholder="12345678"></div><div class="field"><label for="delete-account-confirmation">Type DELETE to confirm permanent deletion</label><input id="delete-account-confirmation" type="text" autocomplete="off" placeholder="DELETE"></div><button type="button" class="btn" id="delete-account-confirm" style="background:#b91c1c;color:#ffffff">Permanently Delete My Account</button><button type="button" class="btn secondary" id="delete-account-cancel" style="margin-left:8px">Cancel</button></div></div></div>`;
 const setup=document.getElementById('setup-passkey'),msg=document.getElementById('passkey-status');
 setup.onclick=async()=>{setup.disabled=true;msg.textContent='Waiting for your device…';try{
  if(!me?.email_confirmed_at&&!me?.phone_confirmed_at)throw Error('Confirm your email address before setting up a passkey.');
  if(!window.PublicKeyCredential||typeof db?.auth?.registerPasskey!=='function')throw Error('Passkeys are unavailable on this browser.');
  const {error}=await db.auth.registerPasskey();if(error)throw error;
   msg.textContent='Passkey added successfully! You can now use it to sign in.';
   if(me?.user_metadata?.loop_passkey_offer){
     const {data:updated,error:metaError}=await db.auth.updateUser({data:{loop_passkey_offer:false}});
     if(!metaError&&updated?.user)me=updated.user;
     else if(metaError)msg.textContent+=' The setup reminder may still appear; you can dismiss it from My Account.';
   }
 }catch(e){msg.textContent='Could not set up passkey: '+e.message;}finally{setup.disabled=false;}};
 document.getElementById('deactivate-account').onclick=async()=>{
  if(!window.confirm('Deactivate your Loop account? Your public card will be hidden and new contact exchanges will stop. Your profile and connections will be saved, and you can reactivate by signing back in.'))return;
  const btn=document.getElementById('deactivate-account'),status=document.getElementById('deactivate-status');btn.disabled=true;status.textContent='Deactivating…';
  try{
   const {error}=await db.rpc('set_my_account_active',{p_active:false});if(error)throw error;
   profile=await getMyProfile();if(!profile.deactivated_at)throw Error('Account deactivation could not be confirmed.');
   const {error:signOutError}=await db.auth.signOut();
   me=null;profile=null;view='overview';
   location.hash='/auth';authPage(false);
   if(signOutError)announce('Account deactivated. Please clear your session on other devices.');
   else announce('Account deactivated. Sign in again to reactivate.');
  }catch(err){status.textContent='Unable to deactivate: '+err.message;btn.disabled=false;}
 };
 document.getElementById('change-password').onclick=async()=>{const btn=document.getElementById('change-password'),status=document.getElementById('password-status');btn.disabled=true;status.textContent='Sending password-reset email…';try{const {error}=await db.auth.resetPasswordForEmail(me.email,{redirectTo:resetUrl()});if(error)throw error;status.textContent='Check your email for a secure password-reset link.';}catch(e){status.textContent='Could not send reset email: '+e.message;}finally{btn.disabled=false;}};
 // Permanent deletion is a separate two-step server process: verified email code + explicit DELETE.
 const deleteRequest=document.getElementById('delete-account-request');
 const deleteConfirm=document.getElementById('delete-account-confirm');
 const deleteCancel=document.getElementById('delete-account-cancel');
 const deleteVerify=document.getElementById('delete-account-verify');
 const deleteStatus=document.getElementById('delete-account-status');
 const deleteCode=document.getElementById('delete-account-code');
 const deleteWord=document.getElementById('delete-account-confirmation');
 async function callDeletionService(payload){
  const {data,error}=await db.auth.getSession();
  const token=data?.session?.access_token;
  if(error||!token)throw Error('Your session expired. Please sign in again.');
  const endpoint=cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/delete-account';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabaseAnonKey,'Authorization':'Bearer '+token},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw Error(result.error||'Could not complete request ('+response.status+').');
  return result;
 }
 deleteRequest.onclick=async()=>{
  deleteRequest.disabled=true;deleteStatus.textContent='Sending verification code…';
  try{
   const result=await callDeletionService({action:'request'});
   deleteVerify.hidden=false;deleteStatus.textContent=result.message||'Check your login email for your verification code.';
   deleteCode.focus();
  }catch(error){deleteStatus.textContent='Could not send code: '+error.message;}
  finally{if(deleteRequest.isConnected)deleteRequest.disabled=false;}
 };
 deleteCancel.onclick=()=>{deleteVerify.hidden=true;deleteCode.value='';deleteWord.value='';deleteStatus.textContent='Account deletion cancelled. Your account is unchanged.';};
 deleteConfirm.onclick=async()=>{
  const code=deleteCode.value.trim();
  if(!/^\d{8}$/.test(code)){deleteStatus.textContent='Enter the eight-digit email verification code.';return;}
  if(deleteWord.value.trim()!=='DELETE'){deleteStatus.textContent='Type DELETE exactly to continue.';return;}
  if(!window.confirm('FINAL CONFIRMATION: Permanently delete your Loop account, card, connections and uploaded files? This cannot be undone.'))return;
  deleteConfirm.disabled=true;deleteRequest.disabled=true;deleteStatus.textContent='Deleting your account and files… Please keep this page open.';
  try{
   const result=await callDeletionService({action:'confirm',code,confirmation:'DELETE'});
   goodbyeConfirmed=true;
   goodbyeFeedbackToken=typeof result.feedbackToken==='string'?result.feedbackToken:'';
   try{
     sessionStorage.setItem('loop-deletion-completed','1');
     if(goodbyeFeedbackToken)sessionStorage.setItem('loop-deletion-feedback-token',goodbyeFeedbackToken);
   }catch{}
   // Change the route FIRST: signOut triggers an auth event that can rerender the page.
   history.replaceState(null,'',siteRoot()+'#/goodbye');
   me=null;profile=null;view='overview';
   try{await db.auth.signOut({scope:'local'});}catch{}
   goodbyePage();
  }catch(error){deleteStatus.textContent='Account deletion not completed: '+error.message+' If files were partially removed, contact support.';deleteConfirm.disabled=false;deleteRequest.disabled=false;}
 };
 if(me?.user_metadata?.loop_passkey_offer)msg.textContent='Your account is ready! You can set up your passkey now, or do it later.';
}

async function saveProfile(e){
 e.preventDefault();
 const form=e.currentTarget, f=new FormData(form),o={};
 for(const [key] of fields)o[key]=String(f.get(key)||'').trim();
 if(!o.full_name||!o.title){document.getElementById('save-message').textContent='Please enter your full name and job title / credentials.';return;}
 o.photo_url=String(f.get('photo_url')||'').trim();
 o.theme=String(f.get('theme')||'violet');
 if(!THEMES.includes(o.theme)){announce('Choose a valid theme');return;}
 for(const key of ['website','linkedin','photo_url']){
  if(o[key]&&!safeUrl(o[key])){
   document.getElementById('loop-additional-info').open=true;
   document.getElementById('save-message').textContent=`${key} must be a valid http(s) URL.`;
   document.getElementById('f-'+key)?.focus();return;
  }
 }
 // Never submit or change the username: existing personal URLs and QR codes stay valid.
 o.published=f.has('published');
 for(const key of ['show_email','show_phone','show_personal_phone','show_additional_phone','show_work_address'])o[key]=f.has(key);
 const btn=form.querySelector('button[type=submit]');
 const status=document.getElementById('save-message');
 btn.disabled=true;status.textContent='Saving…';
 try{
  const {data,error}=await db.from('profiles').update(o).eq('id',me.id).select().single();
  if(error)throw error;
  profile=data;view='overview';showDashboard();announce('Profile saved successfully!');
  window.scrollTo({top:0,behavior:'smooth'});
 }catch(error){
  const migrationNeeded=/column .* does not exist|could not find the .* column|PGRST204|42703/i.test(error.message||'');
  status.textContent=migrationNeeded?'New profile fields are not configured in Supabase yet. Apply the included SQL migration and try again.':'Could not save your card: '+error.message;
 }finally{if(btn.isConnected)btn.disabled=false;}
}
// Notification count is derived from private contact_exchanges and the user's private read receipt.
function syncUnreadBadges(){
 document.querySelectorAll('[data-unread-count]').forEach(b=>{
  b.hidden=!unreadConnections;
  b.textContent=unreadConnections>99?'99+':String(unreadConnections);
  b.setAttribute('aria-label',`${unreadConnections} unread connections`);
 });
}
async function refreshUnreadConnections(){
 if(!db||!me){unreadConnections=0;syncUnreadBadges();return;}
 try{
  const {data:receipt,error:receiptError}=await db.from('connection_read_state').select('last_viewed_at').eq('owner_id',me.id).maybeSingle();
  if(receiptError)throw receiptError;
  connectionLastViewed=receipt?.last_viewed_at||null;
  let query=db.from('contact_exchanges').select('id',{count:'exact',head:true}).eq('owner_id',me.id);
  if(connectionLastViewed)query=query.gt('created_at',connectionLastViewed);
  const {count,error}=await query;
  if(error)throw error;
  unreadConnections=count||0;
  syncUnreadBadges();
 }catch(e){console.warn('Unread count unavailable. Run connection-notifications.sql:',e.message);}
}
async function markConnectionsRead(){
 if(!db||!me)return;
 // Capture time before loading so any new exchanges that arrive afterward remain unread.
 const seenAt=new Date().toISOString();
 try{
  const {error}=await db.from('connection_read_state').upsert({owner_id:me.id,last_viewed_at:seenAt},{onConflict:'owner_id'});
  if(error)throw error;
  await refreshUnreadConnections();
 }catch(e){console.warn('Unable to mark connections as read:',e.message);}
}
function safeSpreadsheetCell(v){
 const s=String(v??'').replace(/\r\n?/g,'\n');
 // Stop Excel/Sheets from executing untrusted contact text as formulas.
 return /^[\s]*[=+@-]/.test(s)?"'"+s:s;
}
function connectionsCsv(rows){
 const headers=['Name','Email','Phone','Company','Message','Icebreaker question','Icebreaker answer','Date received'];
 const quote=v=>'"'+safeSpreadsheetCell(v).replace(/"/g,'""')+'"';
 const content=[headers,...rows.map(c=>[c.name,c.email,c.phone,c.company,c.message,c.icebreaker_question,c.icebreaker_answer,new Date(c.created_at).toLocaleString()])];
 return '\ufeff'+content.map(row=>row.map(quote).join(',')).join('\r\n');
}
async function fetchAllConnections(){
 const rows=[];
 for(let from=0;from<100000;from+=500){
  const {data,error}=await db.from('contact_exchanges').select('id,name,email,phone,company,message,icebreaker_question,icebreaker_answer,created_at').eq('owner_id',me.id).order('created_at',{ascending:false}).range(from,from+499);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data||data.length<500)break;
 }
 return rows;
}
async function exportConnectionsCsv(){
 const button=null;
 if(button)button.disabled=true;
 try{
  const all=await fetchAllConnections();
  if(!all.length){announce('No connections to export yet');return;}
  download('the-loop-connections-'+new Date().toISOString().slice(0,10)+'.csv',connectionsCsv(all),'text/csv;charset=utf-8');
  announce(`${all.length} connections exported — opens in Excel`);
 }catch(e){announce('Export failed: '+e.message)}finally{if(button)button.disabled=false;}
}
async function printConnections(selectedRows=null){
 // Opening synchronously with click avoids pop-up blocking after the data request.
 const win=window.open('','_blank');
 if(!win){announce('Allow pop-ups to print or save PDF');return;}
 win.document.write('<!doctype html><title>Preparing connections…</title><p>Preparing your connections…</p>');
 try{
  const all=selectedRows||await fetchAllConnections();
  const cells=['Name','Email','Phone','Company','Message','Icebreaker question','Icebreaker answer','Date received'];
  const rows=all.map(c=>[c.name,c.email,c.phone,c.company,c.message,c.icebreaker_question,c.icebreaker_answer,new Date(c.created_at).toLocaleString()]);
  win.document.open();
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>the Loop — Connections</title><style>body{font:12px Arial,sans-serif;color:#172338;margin:24px}h1{font-size:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d6deea;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf2fa}@page{size:landscape;margin:12mm}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>the Loop — Connections</h1><p>'+all.length+' connections · '+esc(new Date().toLocaleString())+'</p><table><thead><tr>'+cells.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></body></html>');
  win.document.close();
  win.focus();
  win.print();
 }catch(e){win.close();announce('Could not prepare print: '+e.message);}
}
async function loadContacts(){
 const target=document.getElementById('contacts-list');
 const search=document.getElementById('contact-search');
 const counter=document.getElementById('contact-count');
 if(!target||!search||!counter||!me)return;
 const ownerId=me.id;
 // Selection is limited to the displayed latest 100; exports marked "all" fetch the entire database.
 let contacts=[];
 const selected=new Set();
 const selectAll=document.getElementById('select-all-connections');
 const clear=document.getElementById('clear-connection-selection');
 const selectedCsv=document.getElementById('export-selected-csv');
 const selectedPrint=document.getElementById('print-selected-connections');
 const selectedDelete=document.getElementById('delete-selected-connections');
 const selectedCount=document.getElementById('connection-selection-count');
 const selectedRows=()=>contacts.filter(c=>selected.has(c.id));
 const filteredRows=()=>{
  const q=search.value.trim().toLocaleLowerCase();
  return contacts.filter(c=>[c.name,c.email,c.phone,c.company,c.message].some(v=>String(v||'').toLocaleLowerCase().includes(q)));
 };
 function updateSelectionUI(){
  const count=selected.size;
  selectedCount.textContent=count+' selected';
  selectedCsv.disabled=selectedPrint.disabled=selectedDelete.disabled=count===0;
  clear.disabled=count===0;
  selectAll.disabled=filteredRows().length===0;
 }
 function draw(){
  const filtered=filteredRows();
  counter.textContent=`${filtered.length} of ${contacts.length} connections${contacts.length===100?' (latest 100 shown; export all includes older records)':''}`;
  target.innerHTML=filtered.length?filtered.map(c=>`<div class="contact-item connection-select-item"><label class="connection-checkbox-label"><input type="checkbox" class="connection-select" data-id="${esc(c.id)}" ${selected.has(c.id)?'checked':''} aria-label="Select ${esc(c.name||'connection')}"><span><strong>${esc(c.name||'Unnamed contact')}</strong><span class="contact-item-detail">${esc(c.email)} ${c.phone?'· '+esc(c.phone):''}</span>${c.company?`<span class="contact-item-detail">${esc(c.company)}</span>`:''}${c.message?`<span class="contact-item-detail">“${esc(c.message)}”</span>`:''}${c.icebreaker_answer?`<span class="contact-item-detail"><strong>Beyond the Business Card:</strong> ${esc(c.icebreaker_question||'')}<span style="display:block">${esc(c.icebreaker_answer)}</span></span>`:''}<span class="contact-item-detail contact-date">${esc(new Date(c.created_at).toLocaleString())}</span></span></label></div>`).join(''):`<div class="empty">${search.value?'No connections match your search.':'No connections yet.'}</div>`;
  updateSelectionUI();
 }
 async function reload(){
  const {data,error}=await db.from('contact_exchanges').select('id,name,email,phone,company,message,icebreaker_question,icebreaker_answer,created_at').eq('owner_id',ownerId).order('created_at',{ascending:false}).limit(100);
  if(!target.isConnected||me?.id!==ownerId)return false;
  if(error){target.innerHTML=`<div class="error">${esc(error.message)}</div>`;return false;}
  contacts=data||[];
  // Discard checked IDs removed elsewhere or by the current delete.
  const ids=new Set(contacts.map(c=>c.id));
  for(const id of selected)if(!ids.has(id))selected.delete(id);
  target.className='';draw();return true;
 }
 target.addEventListener('change',e=>{
  const box=e.target.closest('input.connection-select');if(!box)return;
  if(box.checked)selected.add(box.dataset.id);else selected.delete(box.dataset.id);
  updateSelectionUI();
 });
 search.addEventListener('input',draw);
 selectAll.addEventListener('click',()=>{filteredRows().forEach(c=>selected.add(c.id));draw();});
 clear.addEventListener('click',()=>{selected.clear();draw();});
 selectedCsv.addEventListener('click',()=>{
  const rows=selectedRows();if(!rows.length)return;
  download('the-loop-selected-connections-'+new Date().toISOString().slice(0,10)+'.csv',connectionsCsv(rows),'text/csv;charset=utf-8');
  announce(`${rows.length} selected connections exported`);
 });
 selectedPrint.addEventListener('click',()=>{const rows=selectedRows();if(rows.length)printConnections(rows);});
 selectedDelete.addEventListener('click',async()=>{
  const rows=selectedRows();if(!rows.length)return;
  if(!window.confirm(`Permanently delete ${rows.length} selected connection${rows.length===1?'':'s'}? This cannot be undone. Export them first if you want a backup.`))return;
  selectedDelete.disabled=true;
  try{
   const ids=rows.map(c=>c.id);
   // Delete by both owner_id and ID; Supabase RLS policy adds an independent owner check.
   for(let i=0;i<ids.length;i+=100){
    const {data,error}=await db.from('contact_exchanges').delete().eq('owner_id',ownerId).in('id',ids.slice(i,i+100)).select('id');
    if(error)throw error;
    if((data||[]).length!==ids.slice(i,i+100).length)throw Error('Some records could not be deleted. Refresh and check remaining connections.');
   }
   selected.clear();
   await reload();
   await refreshUnreadConnections();
   announce(`${rows.length} connection${rows.length===1?'':'s'} deleted`);
  }catch(e){announce('Delete failed: '+e.message+' — check connection-delete-fix.sql');await reload();}
  finally{updateSelectionUI();}
 });
 
 
 if(await reload())await markConnectionsRead();
}
async function resetPage(){
  if(!configured){render('<main class="center-wrap"><div class="panel">Password reset is unavailable until Supabase is configured.</div></main>');return}
  if(initialRecoveryError){render(`<main class="center-wrap"><div class="panel auth"><h2>Reset link unavailable</h2><p class="muted">${esc(initialRecoveryError)}. Please request a new password-reset email.</p><a class="btn secondary" href="${esc(siteRoot()+'#/auth')}">Return to Log in</a></div></main>`);return}
  if(!recoveryMode||!me){render('<main class="center-wrap"><div class="panel auth"><h2>Reset link could not be verified</h2><p class="muted">Open the newest password-reset email once. If this page still appears, request another link from Log in.</p><a class="btn secondary" href="'+esc(siteRoot()+'#/auth')+'">Return to Log in</a></div></main>');return}
  render('<main class="center-wrap"><form id="reset-form" class="panel auth form"><h2>Set a new password</h2><p class="muted">Enter a new password for your Loop account.</p><div class="field"><label for="reset-new">New password</label><div style="position:relative"><input id="reset-new" type="password" name="password" minlength="8" autocomplete="new-password" required style="width:100%;padding-right:52px"><button type="button" id="show-reset-new" aria-label="Show new password" aria-pressed="false" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;cursor:pointer;padding:8px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div><div class="field"><label for="reset-confirm">Confirm new password</label><div style="position:relative"><input id="reset-confirm" type="password" name="confirm" minlength="8" autocomplete="new-password" required style="width:100%;padding-right:52px"><button type="button" id="show-reset-confirm" aria-label="Show confirm new password" aria-pressed="false" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;cursor:pointer;padding:8px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div><div id="reset-password-feedback" aria-live="polite"></div><button class="btn block" type="submit">Update password</button><div id="reset-message" aria-live="polite"></div></form></main>');
  loopPasswordFeedback('reset-new','reset-confirm','reset-password-feedback');
  // Independent show/hide controls for both password fields.
  for(const inputId of ['reset-new','reset-confirm']){
    const input=document.getElementById(inputId);
    const button=document.getElementById('show-'+inputId);
    button.onclick=()=>{
      const visible=input.type==='password';
      input.type=visible?'text':'password';
      const paths=visible
        ? '<path d="M3 3l18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-4 4.8M6.6 6.6C3.6 8.6 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.2-.9"/>'
        : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
      button.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
      button.setAttribute('aria-label',(visible?'Hide ':'Show ')+(inputId==='reset-new'?'new password':'confirmation password'));
      button.setAttribute('aria-pressed',String(visible));
    };
  }
  document.getElementById('reset-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),password=String(f.get('password')||''),confirm=String(f.get('confirm')||''),box=document.getElementById('reset-message'),btn=e.target.querySelector('button[type=submit]');if(!loopPasswordValid(password)){box.innerHTML='<div class="error">Password must be at least 8 characters and contain uppercase, lowercase, and a number.</div>';return}if(password!==confirm){box.innerHTML='<div class="error">Passwords do not match.</div>';return}btn.disabled=true;box.textContent='Updating…';try{const {error}=await db.auth.updateUser({password});if(error)throw error;recoveryMode=false;await db.auth.signOut();history.replaceState(null,'',siteRoot()+'#/auth?password-updated');me=null;authPage(false)}catch(err){box.innerHTML=`<div class="error">${esc(err.message)}</div>`;btn.disabled=false}};
}
function confirmationPage(){
  render(`<main class="center-wrap"><div class="panel auth"><h2>Continue to the Loop</h2><p class="muted" style="margin:12px 0 20px">If you just confirmed your email, sign in to finish setting up your digital card. On some phones, email links open in a different browser, so automatic sign-in may not carry over.</p><a class="btn block" href="${esc(siteRoot()+'#/auth')}">Log in to My Account</a><p class="hint" style="margin-top:12px">After you sign in for the first time, we will offer to set up your passkey right away.</p></div></main>`);
}
function finishConfirmation(){
  if(!onConfirmedUrl()||!me||recoveryMode)return false;
  history.replaceState(null,'',siteRoot()+'#/dashboard');
  view='overview';
  dashboard();
  return true;
}

/**
 * Post-deletion page. The anonymous feedback invitation is a single-use,
 * 24-hour token issued only after the delete-account server confirms success.
 * We do not accept or store deleted-user IDs or email addresses.
 */
function goodbyePage(){
  let confirmed=goodbyeConfirmed,token=goodbyeFeedbackToken;
  try{
    confirmed=confirmed||sessionStorage.getItem('loop-deletion-completed')==='1';
    token=token||sessionStorage.getItem('loop-deletion-feedback-token')||'';
  }catch{}
  if(!confirmed){
    render(`<main class="center-wrap"><div class="panel auth" style="text-align:center"><h1 style="font-size:26px;margin-bottom:12px">Thanks for visiting the Loop</h1><p class="muted">We appreciate your interest in our community.</p><a class="btn" href="#/" style="margin-top:18px">Return to homepage</a></div></main>`);
    return;
  }
  render(`<main class="shell" style="padding-top:38px;padding-bottom:56px;max-width:790px">
    <section class="panel" style="text-align:center;padding:clamp(24px,5vw,44px);margin-bottom:20px">
      <div aria-hidden="true" style="font-size:35px;margin-bottom:12px">♡</div>
      <div class="eyebrow" style="margin-bottom:12px">A note from the Loop</div>
      <h1 style="font-size:clamp(25px,5vw,37px);line-height:1.2;margin-bottom:18px">Thank you for being part of the Loop.</h1>
      <p class="muted" style="line-height:1.8;margin:0 auto;max-width:560px">We're sorry to see you go. Your account has been permanently deleted, and we're grateful you gave the Loop a try.</p>
    </section>
    <section id="goodbye-feedback-panel" class="panel" style="padding:clamp(22px,4vw,34px)" ${token?'':'hidden'}>
      <h2 style="font-size:22px;margin-bottom:8px">Help us make the Loop better</h2>
      <p class="hint" style="margin-bottom:24px">Your feedback is optional and anonymous. We won't connect it to your deleted account. Please don't include personal information.</p>
      <form id="goodbye-feedback-form" class="form">
        <div class="field"><label for="goodbye-reason">Why did you decide to leave? (optional)</label>
          <select name="reason" id="goodbye-reason" style="width:100%;padding:12px 13px;border:1px solid var(--line);border-radius:11px;background:var(--card,#fff);color:var(--ink);font:inherit">
            <option value="">Choose a reason</option>
            <option value="Not using the Loop enough">I wasn't using the Loop enough</option>
            <option value="Missing features">The Loop was missing features I needed</option>
            <option value="Technical issues">I experienced technical issues</option>
            <option value="Privacy concerns">I had privacy concerns</option>
            <option value="Found another service">I found another service</option>
            <option value="Other">Other reason</option>
          </select>
        </div>
        <div class="field"><label for="goodbye-rating">How would you rate your experience? (optional)</label>
          <select name="rating" id="goodbye-rating" style="width:100%;padding:12px 13px;border:1px solid var(--line);border-radius:11px;background:var(--card,#fff);color:var(--ink);font:inherit">
            <option value="">Select a rating</option>
            <option value="5">★★★★★ — Excellent</option>
            <option value="4">★★★★☆ — Good</option>
            <option value="3">★★★☆☆ — Okay</option>
            <option value="2">★★☆☆☆ — Could be better</option>
            <option value="1">★☆☆☆☆ — Poor</option>
          </select>
        </div>
        <div class="field"><label for="goodbye-comments">What could we do better? (optional)</label>
          <textarea id="goodbye-comments" name="comments" rows="4" maxlength="500" placeholder="Share any thoughts or suggestions…"></textarea>
        </div>
        <div class="actions" style="align-items:center;gap:12px;flex-wrap:wrap">
          <button type="submit" class="btn" id="goodbye-submit">Submit feedback</button>
          <button type="button" class="btn secondary" id="goodbye-skip">No thanks</button>
        </div>
        <p id="goodbye-status" class="hint" aria-live="polite" role="status" style="margin-top:12px"></p>
      </form>
    </section>
    <section id="goodbye-thanks" class="panel" style="padding:22px;text-align:center" ${token?'hidden':''}>
      <p class="muted">Thank you for being part of the Loop. We wish you all the best.</p>
    </section>
    <div style="text-align:center;margin-top:22px"><a href="#/" class="btn secondary">Return to homepage →</a></div>
  </main>`);
  if(!token)return;
  const form=document.getElementById('goodbye-feedback-form');
  const message=document.getElementById('goodbye-status');
  const submit=document.getElementById('goodbye-submit');
  const dismiss=()=>{
    goodbyeFeedbackToken='';
    try{sessionStorage.removeItem('loop-deletion-feedback-token');}catch{}
    document.getElementById('goodbye-feedback-panel').hidden=true;
    document.getElementById('goodbye-thanks').hidden=false;
  };
  document.getElementById('goodbye-skip').onclick=dismiss;
  form.onsubmit=async event=>{
    event.preventDefault();
    const formData=new FormData(form),reason=String(formData.get('reason')||''),ratingValue=String(formData.get('rating')||''),comments=String(formData.get('comments')||'').trim();
    if(!reason&&!ratingValue&&!comments){message.textContent='Choose a reason, select a rating, or leave a comment — or click No thanks.';return;}
    const rating=ratingValue?Number(ratingValue):null;
    submit.disabled=true;message.textContent='Sending your feedback…';
    try{
      const response=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/functions/v1/account-feedback',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':cfg.supabaseAnonKey},
        body:JSON.stringify({token,reason,rating,comments}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw Error(result.error||'Could not submit feedback.');
      dismiss();
      document.querySelector('#goodbye-thanks p').textContent='Thank you for sharing your thoughts. Your feedback will help us improve the Loop.';
    }catch(error){message.textContent='Could not send feedback: '+error.message;submit.disabled=false;}
  };
}
async function navigate(){if(onResetUrl()){resetPage();return}if(onConfirmedUrl()){if(!finishConfirmation())confirmationPage();return}const {path,arg}=route();updateQuickQrInstallMetadata(path===MY_QR_ROUTE||path.startsWith(MY_QR_PREFIX));if(path===MY_QR_ROUTE){myQuickQrPage();return}if(path.startsWith(MY_QR_PREFIX)){let username='';try{username=decodeURIComponent(path.slice(MY_QR_PREFIX.length));}catch{}myQuickQrPage(username||'!invalid!');return}if(path==='/'){landing();return}if(path==='/demo'){demoPage();return}if(path==='/goodbye'){goodbyePage();return}if(path==='/auth'){authPage(arg==='signup');return}if(path==='/dashboard'){dashboard();return}if(path==='/reset'){resetPage();return}if(path.startsWith('/u/')){publicPage(decodeURIComponent(path.slice(3)));return}landing()}
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
    if(event==='SIGNED_IN' && onResetUrl() && !initialRecoveryError && session?.user){
      // Some mobile email browsers establish the session without delivering PASSWORD_RECOVERY.
      recoveryMode=true;resetPage();return;
    }
    if(event==='SIGNED_IN' && onConfirmedUrl() && !recoveryMode){finishConfirmation();return;}
    if(event==='SIGNED_OUT' && !recoveryMode && !onResetUrl()){unreadConnections=0;syncUnreadBadges();if(connectionPoll){clearInterval(connectionPoll);connectionPoll=null;}navigate();}
  });
  db.auth.getSession().then(({data})=>{
    me=data.session?.user||null;
     if(me){refreshUnreadConnections();if(connectionPoll)clearInterval(connectionPoll);connectionPoll=setInterval(refreshUnreadConnections,60000);}
    // A recovery URL may already have had its tokens consumed before our listener ran.
    // Require a valid Supabase session; never grant access just because ?page=reset exists.
    if(onResetUrl() && !initialRecoveryError && me)recoveryMode=true;
    if(onResetUrl()||recoveryMode)resetPage();
    else if(!finishConfirmation())navigate();
  });
}else navigate();
window.addEventListener('hashchange',()=>{view='overview';navigate()});
})();
