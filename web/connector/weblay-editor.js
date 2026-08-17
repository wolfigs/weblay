"use strict";(()=>{var x=class{constructor(e,t){this.cfg=e;this.token=t}async call(e,t,i){let n=await fetch(`${this.cfg.server}${t}`,{method:e,headers:{Authorization:`Bearer ${this.token}`,...i?{"Content-Type":"application/json"}:{}},body:i?JSON.stringify(i):void 0});if(!n.ok){let r=await n.json().catch(()=>({error:n.statusText}));throw new Error(r.error||`HTTP ${n.status}`)}return await n.json()}session(){return this.call("GET","/api/v1/edit/session")}drafts(){return this.call("GET",`/api/v1/edit/content?path=${encodeURIComponent(this.cfg.path)}`)}saveDraft(e,t,i,n){return this.call("PUT","/api/v1/edit/content",{path:this.cfg.path,selector:e,content:t,descriptor:i,risk:n})}removeOverride(e){return this.call("DELETE",`/api/v1/edit/content?path=${encodeURIComponent(this.cfg.path)}&selector=${encodeURIComponent(e)}`)}publish(){return this.call("POST","/api/v1/edit/publish",{path:this.cfg.path})}discard(){return this.call("POST","/api/v1/edit/discard",{path:this.cfg.path})}resetElement(e){return this.call("POST","/api/v1/edit/reset-element",{path:this.cfg.path,selector:e})}revisions(){return this.call("GET",`/api/v1/edit/revisions?path=${encodeURIComponent(this.cfg.path)}`)}revision(e){return this.call("GET",`/api/v1/edit/revisions/${e}`)}restoreDraft(e){return this.call("POST",`/api/v1/edit/revisions/${e}/restore-draft`,{})}async upload(e){let t=new FormData;t.append("file",e);let i=await fetch(`${this.cfg.server}/api/v1/edit/upload`,{method:"POST",headers:{Authorization:`Bearer ${this.token}`},body:t});if(!i.ok){let n=await i.json().catch(()=>({error:i.statusText}));throw new Error(n.error||`HTTP ${i.status}`)}return await i.json()}};function m(s){let e=s.getAttribute("data-weblay");if(e)return`[data-weblay="${he(e)}"]`;let t=[],i=s;for(;i&&i!==document.body&&i!==document.documentElement;){let n=i.parentElement;if(i.id&&Ae(i.id))return t.unshift(`#${he(i.id)}`),t.join(" > ");let r=i.tagName.toLowerCase(),o=1;if(n)for(let a of Array.from(n.children)){if(a===i)break;a.tagName===i.tagName&&o++}t.unshift(`${r}:nth-of-type(${o})`),i=n}return t.unshift("body"),t.join(" > ")}function Ae(s){return/^[A-Za-z][\w-]*$/.test(s)}function he(s){return typeof CSS<"u"&&CSS.escape?CSS.escape(s):s.replace(/[^\w-]/g,"\\$&")}var Re=new Set(["A","B","STRONG","I","EM","U","S","STRIKE","DEL","INS","CODE","MARK","SUB","SUP","SMALL","SPAN","BR","ABBR","Q"]),Ie=new Set(["SCRIPT","STYLE","NOSCRIPT","IFRAME","OBJECT","EMBED","TEMPLATE","TEXTAREA","TITLE","HEAD","SVG","MATH"]),Pe={A:new Set(["href","target","rel","title"]),ABBR:new Set(["title"])},Be=new Set(["color","background-color","font-weight","font-style","text-decoration","text-decoration-line","text-transform","font-size"]),$e=new Set(["padding","padding-top","padding-right","padding-bottom","padding-left","margin","margin-top","margin-right","margin-bottom","margin-left","width","height","max-width","max-height","min-width","min-height","object-fit","object-position","color","background-color","font-size","font-weight","font-style","line-height","letter-spacing","text-align","text-transform","text-decoration","font-family","border-radius","opacity"]);function L(s){return $e.has(s.toLowerCase().trim())}function k(s){return!/url\s*\(|expression\s*\(|javascript\s*:|@import|[<>]/i.test(s)}function Ne(s){return!/^\s*(javascript|data|vbscript|file)\s*:/i.test(s)}function De(s,e=Be){let t=[];for(let i of s.split(";")){let n=i.indexOf(":");if(n<0)continue;let r=i.slice(0,n).toLowerCase().trim(),o=i.slice(n+1).trim();o&&e.has(r)&&k(o)&&t.push(`${r}: ${o}`)}return t.join("; ")}function ee(s,e,t){if(!(t>32))for(let i of Array.from(s.childNodes)){if(i.nodeType===Node.TEXT_NODE){e.appendChild(document.createTextNode(i.nodeValue??""));continue}if(i.nodeType!==Node.ELEMENT_NODE)continue;let n=i;if(Ie.has(n.tagName))continue;if(!Re.has(n.tagName)){ee(n,e,t+1);continue}let r=document.createElement(n.tagName.toLowerCase()),o=Pe[n.tagName];if(o)for(let l of o){let p=n.getAttribute(l);p!=null&&(l==="href"&&!Ne(p)||r.setAttribute(l,p))}n.tagName==="A"&&r.getAttribute("target")==="_blank"&&r.setAttribute("rel","noopener noreferrer");let a=n.getAttribute("style");if(a){let l=De(a);l&&r.setAttribute("style",l)}ee(n,r,t+1),e.appendChild(r)}}function A(s){let e=document.createElement("template");e.innerHTML=s;let t=document.createElement("div");return ee(e.content,t,0),t.innerHTML}function ue(s){let e=document.createElement("template");return e.innerHTML=s,!e.content.querySelector("*")}var te=[{id:"desktop",label:"Desktop",previewWidth:0,maxWidth:0,icon:'<rect x="2" y="4" width="20" height="13" rx="1.5"/><path d="M8 20h8M12 17v3"/>'},{id:"tablet",label:"Tablet",previewWidth:820,maxWidth:1024,icon:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>'},{id:"mobile",label:"Mobile",previewWidth:390,maxWidth:640,icon:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'}];function me(s){if(!/^\d+$/.test(s))return null;let e=parseInt(s,10);return e>0&&e<=1e4?e:null}var Oe="weblay-media";function ge(s){let e=new Set;for(let i of Object.values(s))for(let n of Object.keys(i.media??{})){let r=me(n);r!==null&&e.add(r)}let t="";for(let i of[...e].sort((n,r)=>r-n)){let n="";for(let[r,o]of Object.entries(s)){let a=o.media?.[String(i)];if(!a)continue;let l=ze(a);l&&(n+=`${r}{${l}}`)}n&&(t+=`@media (max-width:${i}px){${n}}`)}je(Oe,t)}function ze(s){let e=[];for(let[t,i]of Object.entries(s))if(L(t)){if(i===""){e.push(`${t}:unset!important`);continue}k(i)&&e.push(`${t}:${i}!important`)}return e.join(";")}function je(s,e){let t=document.getElementById(s);if(!e){t?.remove();return}t||(t=document.createElement("style"),t.id=s,document.head.appendChild(t)),t.textContent=e}function R(s,e){let t;try{t=document.querySelectorAll(s)}catch{return}if(t.length!==1)return;let i=t[0];if(typeof e.html=="string"?i.innerHTML=A(e.html):typeof e.text=="string"&&(i.textContent=e.text),e.attrs)for(let[n,r]of Object.entries(e.attrs))r===""?i.removeAttribute(n):We(n,r)&&i.setAttribute(n,r);if(e.style&&i instanceof HTMLElement)for(let[n,r]of Object.entries(e.style))L(n)&&k(r)&&i.style.setProperty(n,r)}var Fe=new Set(["src","srcset","alt","title","href","target","rel","aria-label","placeholder"]);function We(s,e){let t=s.toLowerCase();return!(!Fe.has(t)||(t==="href"||t==="src")&&/^\s*(javascript|data|vbscript):/i.test(e))}var Ue={A:[{key:"href",label:"Link URL",inputType:"url"},{key:"title",label:"Tooltip"},{key:"target",label:"Target (_blank / _self)"},{key:"aria-label",label:"ARIA label"}],IMG:[{key:"alt",label:"Alt text"},{key:"title",label:"Tooltip"}],INPUT:[{key:"placeholder",label:"Placeholder"},{key:"aria-label",label:"ARIA label"},{key:"title",label:"Tooltip"}],BUTTON:[{key:"aria-label",label:"ARIA label"},{key:"title",label:"Tooltip"}],TEXTAREA:[{key:"placeholder",label:"Placeholder"},{key:"aria-label",label:"ARIA label"}]},_e=[{key:"title",label:"Tooltip"},{key:"aria-label",label:"ARIA label"}],Ve=["top","right","bottom","left"];function ve(s){let e=String(s).trim().match(/^(-?\d*\.?\d+)\s*([a-z%]*)$/i);return e?{num:parseFloat(e[1]),unit:e[2]||"px"}:{num:0,unit:"px"}}var D=class{constructor(){this.activeEl=null;this.handlers=null;this.syncPos=()=>{if(!this.activeEl||this.panel.style.display==="none")return;let e=this.activeEl.getBoundingClientRect(),t=this.panel.offsetHeight||280,i=296,n=e.top-t-10;n<8&&(n=e.bottom+10),n+t>window.innerHeight-70&&(n=Math.max(8,window.innerHeight-t-74));let r=e.left;r+i>window.innerWidth-8&&(r=window.innerWidth-i-8),r<8&&(r=8),this.panel.style.top=`${n}px`,this.panel.style.left=`${r}px`};this.host=document.createElement("div"),this.host.setAttribute("data-weblay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),this.buildShell(),document.body.appendChild(this.host),window.addEventListener("scroll",this.syncPos,{passive:!0}),window.addEventListener("resize",this.syncPos,{passive:!0})}destroy(){window.removeEventListener("scroll",this.syncPos),window.removeEventListener("resize",this.syncPos),this.host.remove()}show(e,t,i,n=!1,r=null,o=null){this.activeEl=e,this.handlers=i,this.renderBanner(r),this.renderRisk(o),this.renderHeader(e,i,n),this.renderAttrs(e,t,i),this.renderStyle(e,t,i.onStyle),this.renderSpacing(e,t,i.onStyle),this.renderFooter(i),this.selectTab("a"),this.panel.style.display="block",this.syncPos()}renderBanner(e){this.bannerEl.innerHTML=e?`<span class="dot"></span>Editing <b>${e}</b> \xB7 overrides this size &amp; smaller`:"",this.bannerEl.className=e?"bp-banner on":"bp-banner"}renderRisk(e){this.riskEl.textContent=e??"",this.riskEl.className=e?"risk-banner on":"risk-banner"}renderFooter(e){if(this.footerBody.innerHTML="",!(!e.onPeek&&!e.onReset)){if(e.onPeek){let t=document.createElement("button");t.className="pf-btn",t.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span>Hold to peek original</span>',t.title="Press and hold to see the original",t.addEventListener("mousedown",()=>e.onPeek(!0)),t.addEventListener("mouseup",()=>e.onPeek(!1)),t.addEventListener("mouseleave",()=>e.onPeek(!1)),this.footerBody.appendChild(t)}if(e.onReset&&e.hasOverride){let t=document.createElement("button");t.className="pf-btn danger",t.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg><span>Reset to original</span>',t.addEventListener("click",()=>e.onReset()),this.footerBody.appendChild(t)}}}hide(){this.panel.style.display="none",this.activeEl=null}buildShell(){this.shadow.innerHTML=`
      <style>
        :host { all: initial; }
        .panel {
          display: none; position: fixed; width: 296px;
          background: #0b0d17; border: 1px solid #272a3a; border-radius: 12px;
          overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,.75);
          z-index: 2147483646;
          font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #e5e7eb;
        }
        .bp-banner { display: none; }
        .bp-banner.on {
          display: flex; align-items: center; gap: 7px;
          padding: 8px 14px; background: #2e1065; color: #ddd6fe;
          font-size: 11.5px; border-bottom: 1px solid #3b1e78;
        }
        .bp-banner b { font-weight: 700; color: #fff; }
        .bp-banner .dot { width: 6px; height: 6px; border-radius: 50%; background: #a78bfa; flex: 0 0 auto; }
        .risk-banner { display: none; }
        .risk-banner.on {
          display: block; padding: 8px 14px; background: #2a1e05; color: #fcd34d;
          font-size: 11.5px; line-height: 1.45; border-bottom: 1px solid #4a3410;
        }
        .header { padding: 14px 16px 0; }
        .header:empty { display: none; }
        .el-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .el-chip {
          font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #a5b4fc; background: #161824; border: 1px solid #272a3a;
          padding: 3px 8px; border-radius: 6px;
        }
        .el-parent {
          display: inline-flex; align-items: center; gap: 5px;
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #9ca3af; padding: 4px 9px; cursor: pointer; font: inherit; font-size: 11px;
        }
        .el-parent:hover { background: #1f2333; color: #e5e7eb; }
        .el-parent svg { width: 12px; height: 12px; }
        .choose-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; box-sizing: border-box;
          background: #6366f1; border: 0; border-radius: 9px;
          color: #fff; padding: 11px 14px; cursor: pointer; font: inherit;
          font-weight: 600; font-size: 13px;
          box-shadow: 0 4px 14px rgba(99,102,241,.35);
        }
        .choose-btn:hover { background: #818cf8; }
        .choose-btn svg { width: 15px; height: 15px; }
        .open-btn {
          background: #161824; color: #a5b4fc; border: 1px solid #313552;
          box-shadow: none;
        }
        .open-btn:hover { background: #1f2333; color: #c7d2fe; }
        .tabs { display: flex; border-bottom: 1px solid #1a1d2e; margin-top: 12px; }
        .tab {
          flex: 1; padding: 10px 0; background: none; border: 0;
          border-bottom: 2px solid transparent; margin-bottom: -1px;
          color: #6b7280; cursor: pointer; font: inherit;
          font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
        }
        .tab.on { color: #a5b4fc; border-bottom-color: #6366f1; }
        .body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
        .body.off { display: none; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field-label { font-size: 11px; color: #9ca3af; font-weight: 500; }
        .field-input {
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #e5e7eb; padding: 6px 10px; outline: none; width: 100%; box-sizing: border-box;
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .field-input:focus { border-color: #6366f1; }
        .spacing-section {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 10px; color: #6b7280; font-weight: 700;
          text-transform: uppercase; letter-spacing: .08em;
          padding-bottom: 8px; border-bottom: 1px solid #1a1d2e;
        }
        .link-toggle {
          background: none; border: 0; cursor: pointer; padding: 2px 4px;
          color: #4b5563; font: inherit; font-size: 13px; line-height: 1; border-radius: 4px;
          filter: grayscale(1) opacity(.6);
        }
        .link-toggle:hover { filter: grayscale(.4) opacity(.9); }
        .link-toggle.on { filter: none; }
        .bm {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px 4px;
          align-items: center;
          justify-items: center;
        }
        .bm-label {
          font-size: 9px; color: #4b5563; font-weight: 700;
          text-transform: uppercase; letter-spacing: .06em;
        }
        .stepper {
          display: inline-flex; align-items: center;
          background: #161824; border: 1px solid #272a3a; border-radius: 7px;
          overflow: hidden; height: 28px;
        }
        .stepper:focus-within { border-color: #6366f1; }
        .step-btn {
          width: 22px; height: 100%; border: 0; background: none; cursor: pointer;
          color: #9ca3af; font: 15px/1 -apple-system, sans-serif; padding: 0;
          display: flex; align-items: center; justify-content: center;
          user-select: none;
        }
        .step-btn:hover { background: #22263a; color: #e5e7eb; }
        .step-btn:active { background: #2a2f45; }
        .step-val {
          width: 34px; text-align: center; border: 0; background: none; outline: none;
          color: #e5e7eb; padding: 0;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          -moz-appearance: textfield;
        }
        .step-val::-webkit-outer-spin-button,
        .step-val::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        /* Style tab: label + control rows */
        .srow {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          min-height: 30px;
        }
        .srow > .field-label { flex: 0 0 auto; }
        .sel {
          background: #161824; border: 1px solid #272a3a; border-radius: 7px;
          color: #e5e7eb; height: 28px; padding: 0 8px; outline: none; cursor: pointer;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .sel:focus { border-color: #6366f1; }
        .seg { display: inline-flex; background: #161824; border: 1px solid #272a3a; border-radius: 7px; overflow: hidden; }
        .seg button {
          width: 30px; height: 28px; border: 0; background: none; cursor: pointer;
          color: #9ca3af; display: flex; align-items: center; justify-content: center; padding: 0;
        }
        .seg button + button { border-left: 1px solid #272a3a; }
        .seg button:hover { background: #22263a; color: #e5e7eb; }
        .seg button.on { background: #312e81; color: #c7d2fe; }
        .seg svg { width: 15px; height: 15px; }
        .color-ctl { display: inline-flex; align-items: center; gap: 6px; }
        .color-ctl input[type=color] {
          -webkit-appearance: none; appearance: none; width: 28px; height: 28px; padding: 0;
          border: 1px solid #272a3a; border-radius: 7px; background: none; cursor: pointer;
        }
        .color-ctl input[type=color]::-webkit-color-swatch-wrapper { padding: 2px; }
        .color-ctl input[type=color]::-webkit-color-swatch { border: 0; border-radius: 5px; }
        .color-ctl .hex {
          width: 78px; height: 28px; box-sizing: border-box;
          background: #161824; border: 1px solid #272a3a; border-radius: 7px;
          color: #e5e7eb; padding: 0 8px; outline: none;
          font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .color-ctl .hex:focus { border-color: #6366f1; }
        .color-ctl .clear {
          width: 24px; height: 28px; border: 0; background: none; color: #6b7280; cursor: pointer; border-radius: 6px;
        }
        .color-ctl .clear:hover { background: #1f2333; color: #d1d5db; }
        .sdivide { height: 1px; background: #1a1d2e; margin: 4px 0; }
        .pfoot { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #1a1d2e; }
        .pfoot:empty { display: none; }
        .pf-btn {
          flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          background: #161824; border: 1px solid #272a3a; border-radius: 8px; color: #9ca3af;
          padding: 8px 10px; cursor: pointer; font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .pf-btn:hover { background: #1f2333; color: #e5e7eb; }
        .pf-btn svg { width: 14px; height: 14px; }
        .pf-btn.danger { color: #fca5a5; border-color: #3a2020; }
        .pf-btn.danger:hover { background: #3a1d1d; color: #fecaca; }
      </style>
      <div class="panel" id="panel">
        <div class="bp-banner" id="bpb"></div>
        <div class="risk-banner" id="rsk"></div>
        <div class="header" id="hb"></div>
        <div class="tabs" id="tabs">
          <button class="tab on" data-tab="a">Content</button>
          <button class="tab" data-tab="t">Style</button>
          <button class="tab" data-tab="s">Spacing</button>
        </div>
        <div class="body" data-body="a" id="ab"></div>
        <div class="body off" data-body="t" id="tb"></div>
        <div class="body off" data-body="s" id="sb"></div>
        <div class="pfoot" id="pf"></div>
      </div>
    `,this.panel=this.shadow.getElementById("panel"),this.bannerEl=this.shadow.getElementById("bpb"),this.riskEl=this.shadow.getElementById("rsk"),this.footerBody=this.shadow.getElementById("pf"),this.headerBody=this.shadow.getElementById("hb"),this.attrsBody=this.shadow.getElementById("ab"),this.styleBody=this.shadow.getElementById("tb"),this.spacingBody=this.shadow.getElementById("sb"),this.shadow.getElementById("tabs").addEventListener("click",t=>{let i=t.target.closest(".tab");i&&this.selectTab(i.dataset.tab)})}selectTab(e){let t=this.shadow.getElementById("tabs");for(let i of Array.from(t.querySelectorAll(".tab")))i.className=i.dataset.tab===e?"tab on":"tab";for(let i of Array.from(this.shadow.querySelectorAll(".body")))i.className=i.dataset.body===e?"body":"body off";this.handlers?.onTab?.(e)}renderHeader(e,t,i){if(this.headerBody.innerHTML="",!i){let n=document.createElement("div");n.className="el-bar";let r=document.createElement("span");if(r.className="el-chip",r.textContent=e.tagName.toLowerCase(),n.appendChild(r),t.onParent){let o=document.createElement("button");o.className="el-parent",o.title="Select parent element",o.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg><span>Parent</span>',o.addEventListener("click",()=>t.onParent()),n.appendChild(o)}this.headerBody.appendChild(n)}if(i){let n=document.createElement("button");n.className="choose-btn",n.innerHTML=`
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <span>Change image</span>
      `,n.addEventListener("click",()=>Je(t.onUpload)),this.headerBody.appendChild(n);return}if(e instanceof HTMLAnchorElement&&e.getAttribute("href")){let n=document.createElement("button");n.className="choose-btn open-btn",n.innerHTML=`
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <path d="M15 3h6v6"/><path d="M10 14 21 3"/>
        </svg>
        <span>Open link</span>
      `,n.addEventListener("click",()=>{window.location.href=e.href}),this.headerBody.appendChild(n)}}renderAttrs(e,t,i){let n=Ue[e.tagName]??_e,r=t.attrs??{};this.attrsBody.innerHTML="";for(let o of n){let a=r[o.key]??e.getAttribute(o.key)??"",l=document.createElement("div");l.className="field";let p=document.createElement("span");p.className="field-label",p.textContent=o.label;let c=document.createElement("input");c.className="field-input",c.type=o.inputType??"text",c.value=a,c.placeholder=o.key,c.addEventListener("change",()=>{let d=c.value.trim();i.onAttr(o.key,d),o.key==="target"&&d==="_blank"&&i.onAttr("rel","noopener noreferrer")}),l.append(p,c),this.attrsBody.appendChild(l)}}renderStyle(e,t,i){let n=window.getComputedStyle(e),r=t.style??{},o=c=>r[c]??n.getPropertyValue(c)??"";this.styleBody.innerHTML="";let a=c=>this.styleBody.appendChild(c),l=(c,d)=>e.style.setProperty(c,d),p=(c,d)=>{e.style.setProperty(c,d),i(c,d)};a(w("Align",Ke([{v:"left",icon:N("left")},{v:"center",icon:N("center")},{v:"right",icon:N("right")},{v:"justify",icon:N("justify")}],Xe(o("text-align")),c=>p("text-align",c)))),a(w("Font size",B({initial:o("font-size"),min:1,step:1,onInput:c=>l("font-size",c),onChange:c=>p("font-size",c)}))),a(w("Line height",B({initial:o("line-height"),min:0,step:.1,unit:"",onInput:c=>l("line-height",c),onChange:c=>p("line-height",c)}))),a(w("Letter spacing",B({initial:o("letter-spacing"),step:.5,allowNegative:!0,onInput:c=>l("letter-spacing",c),onChange:c=>p("letter-spacing",c)}))),a(w("Weight",fe([["","Default"],["400","Normal"],["500","Medium"],["600","Semibold"],["700","Bold"]],Ye(o("font-weight")),c=>p("font-weight",c)))),a(w("Transform",fe([["","Default"],["none","None"],["uppercase","UPPER"],["capitalize","Capitalize"],["lowercase","lower"]],o("text-transform"),c=>p("text-transform",c)))),a(Ge()),a(w("Text color",be({initial:o("color"),onChange:c=>p("color",c)}))),a(w("Background",be({initial:r["background-color"]??n.backgroundColor,onChange:c=>p("background-color",c)}))),a(w("Radius",B({initial:o("border-radius"),min:0,step:1,onInput:c=>l("border-radius",c),onChange:c=>p("border-radius",c)})))}renderSpacing(e,t,i){let n=window.getComputedStyle(e),r=t.style??{};this.spacingBody.innerHTML="";for(let o of["padding","margin"]){let a={on:!1},l=new Map,p=document.createElement("div");p.className="spacing-section";let c=document.createElement("span");c.textContent=o==="padding"?"Padding":"Margin";let d=document.createElement("button");d.className="link-toggle",d.title="Link all sides",d.textContent="\u{1F517}",d.addEventListener("click",()=>{a.on=!a.on,d.className=a.on?"link-toggle on":"link-toggle"}),p.append(c,d),this.spacingBody.appendChild(p);let h=document.createElement("div");h.className="bm";let g=[{side:"top",col:2,row:1},{side:"left",col:1,row:2},{side:"right",col:3,row:2},{side:"bottom",col:2,row:3}],y=document.createElement("div");y.className="bm-label",y.style.cssText="grid-column:2;grid-row:2;",y.textContent=o==="padding"?"PAD":"MAR",h.appendChild(y);for(let{side:u,col:I,row:b}of g){let E=`${o}-${u}`,P=r[E]??n.getPropertyValue(E)??"0px",{num:Me,unit:de}=ve(P),J=document.createElement("div");J.style.cssText=`grid-column:${I};grid-row:${b};`;let Q=document.createElement("div");Q.className="stepper";let S=document.createElement("button");S.className="step-btn",S.type="button",S.textContent="\u2212";let f=document.createElement("input");f.className="step-val",f.type="number",f.min="0",f.value=String(Me),f.title=E,l.set(u,f);let M=document.createElement("button");M.className="step-btn",M.type="button",M.textContent="+";let Z=(C,Ce)=>{let He=a.on?Ve.map(H=>[`${o}-${H}`,l.get(H)]):[[E,f]];for(let[H,pe]of He)pe&&(pe.value=String(C)),e.style.setProperty(H,`${C}${de}`),Ce||i(H,`${C}${de}`)},ce=C=>{Z(Math.max(0,(parseFloat(f.value)||0)+C),!1)};S.addEventListener("click",()=>ce(-1)),M.addEventListener("click",()=>ce(1)),f.addEventListener("input",()=>{Z(Math.max(0,parseFloat(f.value)||0),!0)}),f.addEventListener("change",()=>{Z(Math.max(0,parseFloat(f.value)||0),!1)}),Q.append(S,f,M),J.appendChild(Q),h.appendChild(J)}this.spacingBody.appendChild(h)}}};function w(s,e){let t=document.createElement("div");t.className="srow";let i=document.createElement("span");return i.className="field-label",i.textContent=s,t.append(i,e),t}function Ge(){let s=document.createElement("div");return s.className="sdivide",s}function B(s){let e=ve(s.initial),t=s.unit!==void 0?s.unit:e.unit,i=s.step??1,n=s.allowNegative?-1/0:s.min??0,r=document.createElement("div");r.className="stepper";let o=document.createElement("button");o.className="step-btn",o.type="button",o.textContent="\u2212";let a=document.createElement("input");a.className="step-val",a.type="number",a.value=String($(e.num)),s.allowNegative||(a.min=String(s.min??0));let l=document.createElement("button");l.className="step-btn",l.type="button",l.textContent="+";let p=h=>`${$(h)}${t}`,c=h=>h<n?n:h,d=h=>{let g=c((parseFloat(a.value)||0)+h);a.value=String($(g)),s.onChange(p(g))};return o.addEventListener("click",()=>d(-i)),l.addEventListener("click",()=>d(i)),a.addEventListener("input",()=>{let h=c(parseFloat(a.value)||0);(s.onInput??s.onChange)(p(h))}),a.addEventListener("change",()=>{let h=c(parseFloat(a.value)||0);a.value=String($(h)),s.onChange(p(h))}),r.append(o,a,l),r}function $(s){return Math.round(s*100)/100}function Ke(s,e,t){let i=document.createElement("div");i.className="seg";for(let n of s){let r=document.createElement("button");r.type="button",r.innerHTML=n.icon,r.className=n.v===e?"on":"",r.addEventListener("click",()=>{for(let o of Array.from(i.children))o.className="";r.className="on",t(n.v)}),i.appendChild(r)}return i}function fe(s,e,t){let i=document.createElement("select");i.className="sel";for(let[n,r]of s){let o=document.createElement("option");o.value=n,o.textContent=r,n===e&&(o.selected=!0),i.appendChild(o)}return i.addEventListener("change",()=>t(i.value)),i}function be(s){let e=qe(s.initial),t=document.createElement("div");t.className="color-ctl";let i=document.createElement("input");i.type="color",i.value=e||"#000000";let n=document.createElement("input");n.className="hex",n.type="text",n.value=e,n.placeholder="\u2014",n.spellcheck=!1;let r=document.createElement("button");return r.type="button",r.className="clear",r.title="Clear",r.textContent="\u2715",i.addEventListener("input",()=>{n.value=i.value,s.onChange(i.value)}),n.addEventListener("change",()=>{let o=n.value.trim();if(o===""){s.onChange("");return}if(/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(o)){let a=o.startsWith("#")?o:"#"+o;i.value=a.length===4?"#"+a.slice(1).split("").map(l=>l+l).join(""):a,s.onChange(a)}}),r.addEventListener("click",()=>{n.value="",s.onChange("")}),t.append(i,n,r),t}function qe(s){let e=String(s||"").trim();if(!e||e==="transparent"||e==="none"||/rgba?\([^)]*,\s*0\s*\)/.test(e))return"";let t=e.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);if(t){let i=n=>Number(n).toString(16).padStart(2,"0");return`#${i(t[1])}${i(t[2])}${i(t[3])}`}return/^#[0-9a-f]{6}$/i.test(e)?e.toLowerCase():/^#[0-9a-f]{3}$/i.test(e)?("#"+e.slice(1).split("").map(i=>i+i).join("")).toLowerCase():""}function Xe(s){let e=String(s).trim().toLowerCase();return["left","center","right","justify"].includes(e)?e:""}function Ye(s){let e=String(s).trim().toLowerCase();return e==="bold"?"700":e==="normal"?"400":["400","500","600","700"].includes(e)?e:""}function N(s){return`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${{left:'<line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="13" y2="18"/>',center:'<line x1="6" y1="6" x2="18" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="7" y1="18" x2="17" y2="18"/>',right:'<line x1="9" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="11" y1="18" x2="21" y2="18"/>',justify:'<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'}[s]}</svg>`}function Je(s){let e=document.createElement("input");e.type="file",e.accept="image/*",e.onchange=()=>{e.files?.[0]&&s(e.files[0])},e.click()}var Qe=["nw","n","ne","e","se","s","sw","w"],O=class{constructor(e){this.img=null;this.dragging=null;this.ratio=1;this.sync=()=>{if(!this.img||this.overlay.style.display==="none")return;let e=this.img.getBoundingClientRect();this.overlay.style.top=`${e.top}px`,this.overlay.style.left=`${e.left}px`,this.overlay.style.width=`${e.width}px`,this.overlay.style.height=`${e.height}px`,this.badge.textContent=`${Math.round(e.width)} \xD7 ${Math.round(e.height)}`};this.onMove=e=>{if(!this.dragging||!this.img)return;let{pos:t,startX:i,startY:n,startW:r,startH:o}=this.dragging,a=e.clientX-i,l=e.clientY-n,p=e.shiftKey,c=r,d=o;t.includes("e")&&(c=Math.max(20,r+a)),t.includes("w")&&(c=Math.max(20,r-a)),t.includes("s")&&(d=Math.max(20,o+l)),t.includes("n")&&(d=Math.max(20,o-l)),p&&(t.length===2?d=c/this.ratio:t==="n"||t==="s"?c=d*this.ratio:d=c/this.ratio),c=Math.round(c),d=Math.round(d),this.img.style.width=`${c}px`,this.img.style.height=`${d}px`,this.sync()};this.onUp=()=>{if(!this.dragging||!this.img)return;let e=this.img.getBoundingClientRect();this.dragging=null,this.onDone({widthPx:Math.round(e.width),heightPx:Math.round(e.height)})};this.onDone=e,this.host=document.createElement("div"),this.host.setAttribute("data-weblay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),this.buildOverlay(),document.body.appendChild(this.host),window.addEventListener("scroll",this.sync,{passive:!0}),window.addEventListener("resize",this.sync,{passive:!0}),document.addEventListener("mousemove",this.onMove),document.addEventListener("mouseup",this.onUp)}destroy(){window.removeEventListener("scroll",this.sync),window.removeEventListener("resize",this.sync),document.removeEventListener("mousemove",this.onMove),document.removeEventListener("mouseup",this.onUp),this.host.remove()}attach(e){this.img=e,this.ratio=e.naturalWidth>0&&e.naturalHeight>0?e.naturalWidth/e.naturalHeight:1,this.overlay.style.display="block",this.sync()}detach(){this.overlay.style.display="none",this.img=null,this.dragging=null}buildOverlay(){this.shadow.innerHTML=`
      <style>
        :host { all: initial; }
        .ov {
          display: none; position: fixed; pointer-events: none;
          border: 2px solid #6366f1; border-radius: 2px;
          z-index: 2147483645;
        }
        .h {
          position: absolute; width: 10px; height: 10px;
          background: #6366f1; border: 2px solid #fff; border-radius: 2px;
          pointer-events: all; box-sizing: border-box;
          transform: translate(-50%, -50%);
        }
        .h[data-p="nw"] { top:0; left:0;   cursor:nw-resize; }
        .h[data-p="n"]  { top:0; left:50%; cursor:n-resize;  }
        .h[data-p="ne"] { top:0; left:100%;cursor:ne-resize; }
        .h[data-p="e"]  { top:50%;left:100%;cursor:e-resize; }
        .h[data-p="se"] { top:100%;left:100%;cursor:se-resize;}
        .h[data-p="s"]  { top:100%;left:50%;cursor:s-resize; }
        .h[data-p="sw"] { top:100%;left:0;  cursor:sw-resize;}
        .h[data-p="w"]  { top:50%;left:0;   cursor:w-resize; }
        .badge {
          position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%);
          background: #0b0d17; color: #a5b4fc; border: 1px solid #272a3a;
          font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 2px 8px; border-radius: 4px; white-space: nowrap; pointer-events: none;
        }
      </style>
      <div class="ov" id="ov">
        ${Qe.map(e=>`<div class="h" data-p="${e}"></div>`).join("")}
        <div class="badge" id="badge"></div>
      </div>
    `,this.overlay=this.shadow.getElementById("ov"),this.badge=this.shadow.getElementById("badge");for(let e of Array.from(this.shadow.querySelectorAll(".h")))e.addEventListener("mousedown",t=>{if(t.preventDefault(),t.stopPropagation(),!this.img)return;let i=this.img.getBoundingClientRect();this.dragging={pos:e.dataset.p??"se",startX:t.clientX,startY:t.clientY,startW:i.width,startH:i.height}})}};var z=class{constructor(e,t){this.onLive=e;this.onDone=t;this.grips=[];this.target=null;this.drag=null;this.sync=()=>{if(!this.target||this.overlay.style.display==="none")return;let e=this.metrics(),{r:t,border:i,pad:n,mar:r}=e,o=t.left-r.l,a=t.top-r.t,l=r.l+t.width+r.r,p=r.t+t.height+r.b;this.overlay.style.left=`${o}px`,this.overlay.style.top=`${a}px`,this.overlay.style.width=`${l}px`,this.overlay.style.height=`${p}px`;let c=r.l,d=r.t,h=t.width,g=t.height;ye(this.marginBox,0,0,l,p);let y=c+i.l+n.l,u=d+i.t+n.t;ye(this.contentBox,y,u,h-i.l-i.r-n.l-n.r,g-i.t-i.b-n.t-n.b);let I=c+h/2,b=d+g/2;for(let E of this.grips){let P=this.gripPos(E,{bx:c,by:d,bw:h,bh:g,ow:l,oh:p,border:i,pad:n,midX:I,midY:b});E.el.style.left=`${P.x}px`,E.el.style.top=`${P.y}px`}};this.onMove=e=>{if(!this.drag||!this.target)return;let{grip:t,startX:i,startY:n,startVal:r}=this.drag,o=e.clientX-i,a=e.clientY-n,l={top:a,bottom:-a,left:o,right:-o},p={top:-a,bottom:a,left:-o,right:o},c=t.group==="padding"?l[t.side]:p[t.side],d=Math.max(0,Math.round(r+c)),h=`${t.group}-${t.side}`;this.target.style.setProperty(h,`${d}px`),this.onLive(h,d),this.sync(),this.showLabel(t,d)};this.onUp=()=>{if(!this.drag||!this.target)return;let{grip:e}=this.drag,t=`${e.group}-${e.side}`,i=this.px(getComputedStyle(this.target).getPropertyValue(t));this.drag=null,this.label.style.display="none",this.onDone(t,Math.round(i))};this.host=document.createElement("div"),this.host.setAttribute("data-weblay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),this.build(),document.body.appendChild(this.host),window.addEventListener("scroll",this.sync,{passive:!0}),window.addEventListener("resize",this.sync,{passive:!0}),document.addEventListener("mousemove",this.onMove),document.addEventListener("mouseup",this.onUp)}destroy(){window.removeEventListener("scroll",this.sync),window.removeEventListener("resize",this.sync),document.removeEventListener("mousemove",this.onMove),document.removeEventListener("mouseup",this.onUp),this.host.remove()}attach(e){this.target=e,this.overlay.style.display="block",this.sync()}detach(){this.overlay.style.display="none",this.target=null,this.drag=null}build(){let e=["top","right","bottom","left"];this.shadow.innerHTML=`
      <style>
        :host { all: initial; }
        .ov { display: none; position: fixed; pointer-events: none; z-index: 2147483644; }
        .box { position: absolute; box-sizing: border-box; border-radius: 3px; }
        .margin-box { border: 1px dashed rgba(251,191,36,.9); }
        .content-box { border: 1px dashed rgba(45,212,191,.9); }
        .grip {
          position: absolute; pointer-events: all; box-sizing: border-box;
          transform: translate(-50%, -50%); border-radius: 4px;
          box-shadow: 0 1px 4px rgba(0,0,0,.4);
        }
        .grip.padding { background: #2dd4bf; }
        .grip.margin { background: #fbbf24; }
        .grip.top, .grip.bottom { width: 26px; height: 7px; cursor: ns-resize; }
        .grip.left, .grip.right { width: 7px; height: 26px; cursor: ew-resize; }
        .grip:hover { filter: brightness(1.15); }
        .label {
          position: absolute; display: none; transform: translate(-50%, -50%);
          background: #0b0d17; color: #e5e7eb; border: 1px solid #272a3a;
          font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
          padding: 3px 7px; border-radius: 5px; white-space: nowrap; pointer-events: none;
          z-index: 1;
        }
        .label b { color: #a5b4fc; font-weight: 600; }
      </style>
      <div class="ov" id="ov">
        <div class="box margin-box" id="mbox"></div>
        <div class="box content-box" id="cbox"></div>
        ${["margin","padding"].flatMap(t=>e.map(i=>`<div class="grip ${t} ${i}" data-g="${t}" data-s="${i}"></div>`)).join("")}
        <div class="label" id="label"></div>
      </div>`,this.overlay=this.shadow.getElementById("ov"),this.marginBox=this.shadow.getElementById("mbox"),this.contentBox=this.shadow.getElementById("cbox"),this.label=this.shadow.getElementById("label");for(let t of Array.from(this.shadow.querySelectorAll(".grip"))){let i={group:t.dataset.g,side:t.dataset.s,el:t};this.grips.push(i),t.addEventListener("mousedown",n=>this.startDrag(n,i))}}px(e){let t=parseFloat(e);return Number.isFinite(t)?t:0}metrics(){let e=this.target,t=e.getBoundingClientRect(),i=getComputedStyle(e);return{r:t,border:{t:this.px(i.borderTopWidth),r:this.px(i.borderRightWidth),b:this.px(i.borderBottomWidth),l:this.px(i.borderLeftWidth)},pad:{t:this.px(i.paddingTop),r:this.px(i.paddingRight),b:this.px(i.paddingBottom),l:this.px(i.paddingLeft)},mar:{t:this.px(i.marginTop),r:this.px(i.marginRight),b:this.px(i.marginBottom),l:this.px(i.marginLeft)}}}gripPos(e,t){let{bx:i,by:n,bw:r,bh:o,ow:a,oh:l,border:p,pad:c,midX:d,midY:h}=t;if(e.group==="margin")switch(e.side){case"top":return{x:d,y:0};case"bottom":return{x:d,y:l};case"left":return{x:0,y:h};case"right":return{x:a,y:h}}switch(e.side){case"top":return{x:d,y:n+p.t+c.t};case"bottom":return{x:d,y:n+o-p.b-c.b};case"left":return{x:i+p.l+c.l,y:h};case"right":return{x:i+r-p.r-c.r,y:h}}}startDrag(e,t){if(e.preventDefault(),e.stopPropagation(),!this.target)return;let i=getComputedStyle(this.target),n=this.px(i.getPropertyValue(`${t.group}-${t.side}`));this.drag={grip:t,startX:e.clientX,startY:e.clientY,startVal:n},this.showLabel(t,n)}showLabel(e,t){let i=e.el.getBoundingClientRect(),n=this.overlay.getBoundingClientRect();this.label.style.display="block",this.label.style.left=`${i.left+i.width/2-n.left}px`,this.label.style.top=`${i.top+i.height/2-n.top-18}px`,this.label.innerHTML=`<b>${e.group==="padding"?"Padding":"Margin"} ${e.side}</b> ${t}px`}};function ye(s,e,t,i,n){s.style.left=`${e}px`,s.style.top=`${t}px`,s.style.width=`${Math.max(0,i)}px`,s.style.height=`${Math.max(0,n)}px`}var Ze=[{cmd:"bold",label:"<b>B</b>",title:"Bold",key:"\u2318B"},{cmd:"italic",label:"<i>I</i>",title:"Italic",key:"\u2318I"},{cmd:"underline",label:"<u>U</u>",title:"Underline",key:"\u2318U"},{cmd:"strikeThrough",label:"<s>S</s>",title:"Strikethrough"},{cmd:"code",label:"&lt;/&gt;",title:"Inline code"},{cmd:"createLink",label:"\u{1F517}",title:"Link",key:"\u2318K"},{cmd:"removeFormat",label:"\u232B",title:"Clear formatting"}],j=class{constructor(e){this.handlers=e;this.savedRange=null;this.editable=null;this.host=document.createElement("div"),this.host.setAttribute("data-weblay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),this.build(),document.body.appendChild(this.host);try{document.execCommand("styleWithCSS",!1,"false")}catch{}}destroy(){this.host.remove()}setEditable(e){this.editable=e}build(){this.shadow.innerHTML=`
      <style>
        :host { all: initial; }
        .bar {
          display: none; position: fixed; z-index: 2147483647;
          background: #0b0d17; border: 1px solid #272a3a; border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,.6); padding: 4px;
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .row { display: flex; align-items: center; gap: 2px; }
        .row.link { display: none; padding: 2px; gap: 4px; }
        .row.link.on { display: flex; }
        button {
          all: unset; box-sizing: border-box; cursor: pointer;
          min-width: 30px; height: 30px; padding: 0 8px; border-radius: 7px;
          color: #d1d5db; text-align: center; line-height: 30px;
          font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        button:hover { background: #1f2333; color: #fff; }
        button.on { background: #312e81; color: #c7d2fe; }
        button code, button b, button i, button u, button s { font-style: inherit; }
        .sep { width: 1px; height: 18px; background: #272a3a; margin: 0 3px; }
        .link input {
          all: unset; box-sizing: border-box; width: 200px; height: 28px;
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #e5e7eb; padding: 0 9px; font: 12.5px -apple-system, sans-serif;
        }
        .link input:focus { border-color: #6366f1; }
        .link .apply { background: #6366f1; color: #fff; min-width: auto; }
        .link .apply:hover { background: #818cf8; }
      </style>
      <div class="bar" id="bar">
        <div class="row" id="btns"></div>
        <div class="row link" id="linkrow">
          <input id="linkinput" type="url" placeholder="https://\u2026  (empty to remove)" />
          <button class="apply" id="linkapply" title="Apply">Apply</button>
        </div>
      </div>`,this.bar=this.shadow.getElementById("bar"),this.linkRow=this.shadow.getElementById("linkrow"),this.linkInput=this.shadow.getElementById("linkinput");let e=this.shadow.getElementById("btns");for(let t of Ze){t.cmd==="removeFormat"&&e.appendChild(this.sep());let i=document.createElement("button");i.innerHTML=t.label,i.title=t.key?`${t.title} (${t.key})`:t.title,i.dataset.cmd=t.cmd,i.addEventListener("mousedown",n=>n.preventDefault()),i.addEventListener("click",n=>{n.preventDefault(),this.run(t.cmd)}),e.appendChild(i)}this.linkInput.addEventListener("mousedown",t=>t.stopPropagation()),this.linkInput.addEventListener("keydown",t=>{t.key==="Enter"?(t.preventDefault(),this.applyLink()):t.key==="Escape"&&(t.preventDefault(),this.closeLinkRow())}),this.shadow.getElementById("linkapply").addEventListener("mousedown",t=>t.preventDefault()),this.shadow.getElementById("linkapply").addEventListener("click",t=>{t.preventDefault(),this.applyLink()})}sep(){let e=document.createElement("span");return e.className="sep",e}run(e){if(this.hasSelectionInEditable()){if(e==="createLink"){this.openLinkRow();return}if(e==="code"){this.toggleCode(),this.after();return}document.execCommand(e),this.after()}}after(){this.handlers.onChange(),this.syncStates()}toggleCode(){let e=window.getSelection();if(!e||e.rangeCount===0)return;let t=e.getRangeAt(0),i=this.ancestorTag(e,"CODE");if(i){let r=i.parentNode;if(!r)return;for(;i.firstChild;)r.insertBefore(i.firstChild,i);r.removeChild(i);return}if(t.collapsed)return;let n=document.createElement("code");try{n.appendChild(t.extractContents()),t.insertNode(n);let r=document.createRange();r.selectNodeContents(n),e.removeAllRanges(),e.addRange(r)}catch{}}openLinkRow(){this.savedRange=this.currentRange();let e=this.ancestorTag(window.getSelection(),"A");this.linkInput.value=e?.getAttribute("href")??"",this.linkRow.classList.add("on"),this.linkInput.focus(),this.linkInput.select()}closeLinkRow(){this.linkRow.classList.remove("on"),this.savedRange=null,this.editable?.focus()}applyLink(){let e=this.linkInput.value.trim();this.restoreRange(),e?/^\s*(javascript|data|vbscript|file):/i.test(e)||document.execCommand("createLink",!1,e):document.execCommand("unlink"),this.closeLinkRow(),this.after()}currentRange(){let e=window.getSelection();return e&&e.rangeCount?e.getRangeAt(0).cloneRange():null}restoreRange(){if(!this.savedRange)return;let e=window.getSelection();e?.removeAllRanges(),e?.addRange(this.savedRange)}hasSelectionInEditable(){if(!this.editable)return!1;let e=window.getSelection();if(!e||e.rangeCount===0)return!1;let t=e.anchorNode;return!!t&&this.editable.contains(t)}ancestorTag(e,t){let i=e?.anchorNode??null;for(;i&&i!==this.editable;){if(i.nodeType===Node.ELEMENT_NODE&&i.tagName===t)return i;i=i.parentNode}return null}syncFromSelection(){let e=window.getSelection();if(!this.editable||!e||e.rangeCount===0||e.isCollapsed||!this.hasSelectionInEditable()){this.linkRow.classList.contains("on")||this.hide();return}let t=e.getRangeAt(0).getBoundingClientRect();if(t.width===0&&t.height===0){this.hide();return}this.bar.style.display="block",this.position(t),this.syncStates()}position(e){let t=this.bar.offsetWidth||250,i=this.bar.offsetHeight||38,n=e.top-i-8;n<8&&(n=e.bottom+8);let r=e.left+e.width/2-t/2;r=Math.max(8,Math.min(r,window.innerWidth-t-8)),this.bar.style.top=`${n}px`,this.bar.style.left=`${r}px`}syncStates(){let e=window.getSelection();for(let t of Array.from(this.shadow.querySelectorAll("#btns button"))){let i=t.dataset.cmd,n=!1;try{i==="code"?n=!!this.ancestorTag(e,"CODE"):i==="createLink"?n=!!this.ancestorTag(e,"A"):i!=="removeFormat"&&(n=document.queryCommandState(i))}catch{}t.classList.toggle("on",n)}}hide(){this.bar.style.display="none",this.linkRow.classList.remove("on")}get visible(){return this.bar.style.display==="block"}};var W=class{constructor(e,t){this.doc=e;this.handlers=t;this.close=()=>{this.host.querySelector(".wrap")?.classList.remove("open"),setTimeout(()=>{this.shadow.innerHTML=""},220),this.doc.removeEventListener("keydown",this.onKey)};this.onKey=e=>{e.key==="Escape"&&this.close()};this.host=e.createElement("div"),this.host.setAttribute("data-weblay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),e.body.appendChild(this.host)}async open(){this.render('<div class="loading">Loading versions\u2026</div>');try{let e=await this.handlers.list();this.render(this.body(e),e)}catch(e){this.render(`<div class="loading err">${F(e.message)}</div>`)}}render(e,t){this.shadow.innerHTML=`
      <style>
        :host { all: initial; }
        .wrap { position: fixed; inset: 0; z-index: 2147483647;
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.55);
          opacity: 0; transition: opacity .2s; }
        .wrap.open .scrim { opacity: 1; }
        .panel {
          position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 94vw);
          background: #0b0d17; border-left: 1px solid #272a3a; color: #e5e7eb;
          display: flex; flex-direction: column;
          transform: translateX(100%); transition: transform .24s cubic-bezier(.4,0,.2,1);
        }
        .wrap.open .panel { transform: none; }
        .head { display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid #1a1d2e; }
        .head h3 { margin: 0; font-size: 15px; }
        .head .x { background: none; border: 0; color: #9ca3af; cursor: pointer; font-size: 18px; line-height: 1; }
        .head .x:hover { color: #fff; }
        .body { flex: 1; overflow-y: auto; padding: 12px; }
        .loading { color: #6b7280; padding: 24px 8px; text-align: center; }
        .loading.err { color: #f87171; }
        .rev { border: 1px solid #1f2333; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; background: #10131f; }
        .rev.live { border-color: rgba(74,222,128,.4); }
        .rev-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .vtag { font-weight: 700; font-size: 13px; }
        .live-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
          color: #4ade80; background: rgba(74,222,128,.12); padding: 2px 7px; border-radius: 999px; }
        .meta { color: #9ca3af; font-size: 12px; }
        .meta .who { color: #6b7280; }
        .rev-actions { display: flex; gap: 8px; margin-top: 10px; }
        .rev-actions button {
          flex: 1; border: 1px solid #272a3a; background: #161824; color: #d1d5db;
          border-radius: 7px; padding: 7px 0; cursor: pointer; font: inherit; font-size: 12px;
          display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        }
        .rev-actions button:hover { background: #1f2333; color: #fff; }
        .rev-actions .restore { border-color: #3b1e78; color: #c7d2fe; background: #1c1830; }
        .rev-actions .restore:hover { background: #2a2350; }
        .rev-actions svg { width: 13px; height: 13px; }
        .empty { text-align: center; color: #6b7280; padding: 40px 10px; }
      </style>
      <div class="wrap">
        <div class="scrim" data-close></div>
        <div class="panel">
          <div class="head">
            <h3>Version history</h3>
            <button class="x" data-close aria-label="Close">\u2715</button>
          </div>
          <div class="body">${e}</div>
        </div>
      </div>`,requestAnimationFrame(()=>this.shadow.querySelector(".wrap")?.classList.add("open"));for(let i of Array.from(this.shadow.querySelectorAll("[data-close]")))i.onclick=this.close;this.doc.addEventListener("keydown",this.onKey),t&&this.wire(t)}body(e){if(!e.length)return'<div class="empty">No published versions yet.<br>Publish your edits to create the first one.</div>';let t=this.handlers.liveVersion();return e.map(i=>{let n=i.version===t,r=new Date(i.publishedAt);return`
      <div class="rev${n?" live":""}">
        <div class="rev-top">
          <span class="vtag">Version ${i.version}</span>
          ${n?'<span class="live-badge">Live</span>':""}
        </div>
        <div class="meta">${F(r.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"}))} \xB7 ${F(r.toLocaleTimeString(void 0,{hour:"numeric",minute:"2-digit"}))}<br>
          <span class="who">by ${F(i.publishedBy||"unknown")}</span></div>
        <div class="rev-actions">
          <button data-view="${i.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View</button>
          <button class="restore" data-restore="${i.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>Restore as draft</button>
        </div>
      </div>`}).join("")}wire(e){let t=new Map(e.map(i=>[i.id,i]));for(let i of Array.from(this.shadow.querySelectorAll("[data-view]")))i.onclick=()=>{let n=t.get(i.dataset.view);n&&(this.close(),this.handlers.onView(n))};for(let i of Array.from(this.shadow.querySelectorAll("[data-restore]")))i.onclick=async()=>{let n=t.get(i.dataset.restore);if(n){i.textContent="Restoring\u2026";try{await this.handlers.onRestoreDraft(n),this.close()}catch{i.textContent="Failed \u2014 retry"}}}}};function F(s){return String(s??"").replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`)}var U=class{constructor(e){this.host=e.createElement("div"),this.host.setAttribute("data-weblay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),this.build(),e.body.appendChild(this.host)}destroy(){clearTimeout(this.hideTimer),this.host.remove()}busy(e){clearTimeout(this.hideTimer),this.render("busy",e)}ok(e){clearTimeout(this.hideTimer),this.render("ok",e),this.hideTimer=window.setTimeout(()=>this.hide(),1500)}err(e){clearTimeout(this.hideTimer),this.render("err",e),this.hideTimer=window.setTimeout(()=>this.hide(),2800)}hide(){clearTimeout(this.hideTimer),this.pill.className="pill"}async track(e,t,i){this.busy(e);try{let n=await i();return this.ok(t),n}catch(n){throw this.err(n.message||"Something went wrong"),n}}render(e,t){this.label.textContent=t,this.icon.className=`icon ${e}`,this.icon.innerHTML=e==="busy"?'<span class="spin"></span>':e==="ok"?et:tt,this.pill.className=`pill show ${e}`}build(){this.shadow.innerHTML=`
      <style>
        :host { all: initial; }
        .pill {
          position: fixed; top: 14px; left: 50%; transform: translateX(-50%) translateY(-10px);
          z-index: 2147483647; display: inline-flex; align-items: center; gap: 9px;
          max-width: 80vw; padding: 9px 16px; border-radius: 999px;
          background: #0b0d17; color: #e5e7eb; border: 1px solid #272a3a;
          box-shadow: 0 8px 26px rgba(0,0,0,.5);
          font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-weight: 500;
          opacity: 0; pointer-events: none; transition: opacity .18s, transform .18s;
        }
        .pill.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        .pill.ok  { border-color: rgba(74,222,128,.4); }
        .pill.err { border-color: rgba(248,113,113,.5); }
        .icon { display: inline-flex; width: 16px; height: 16px; flex: 0 0 auto; }
        .icon.ok { color: #4ade80; }
        .icon.err { color: #f87171; }
        .icon svg { width: 16px; height: 16px; }
        .spin {
          width: 15px; height: 15px; border-radius: 50%;
          border: 2px solid #313552; border-top-color: #a5b4fc;
          animation: weblay-spin .6s linear infinite; display: inline-block;
        }
        @keyframes weblay-spin { to { transform: rotate(360deg); } }
        .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style>
      <div class="pill" id="pill">
        <span class="icon" id="icon"></span>
        <span class="label" id="label"></span>
      </div>`,this.pill=this.shadow.getElementById("pill"),this.icon=this.shadow.getElementById("icon"),this.label=this.shadow.getElementById("label")}},et='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',tt='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';var v={REPEATER:"repeater",REPEATER_IDENTICAL:"repeater-identical",SHADOW:"shadow",IFRAME:"iframe",GENERATED_ID:"generated-id",NO_LANDMARK:"no-landmark",EMPTY_TEXT:"empty-text"},it="main,header,footer,nav,article,aside,section,[role],[aria-label],[id]",ie=/^:r|(^|[-_])[a-f0-9]{5,}$|^(css|sc|jsx|mui|chakra)-/i;function ne(s){let e={v:1,path:m(s),fp:nt(s)},t=s.getAttribute("data-weblay");t&&(e.weblay=t);let i=rt(s);return i&&(e.idPath=i),e}function G(s){let e=[],t=100;s.getRootNode()instanceof ShadowRoot&&(e.push(v.SHADOW),t-=70),s.ownerDocument!==document&&(e.push(v.IFRAME),t-=70);let n=st(s);if(n.length>=3){let r=n.indexOf(s),o=n.every(a=>_(a)===_(s));return e.push(o?v.REPEATER_IDENTICAL:v.REPEATER),t-=o?55:30,e.length,xe(t,e,{count:n.length,index:r})}return s.id&&ie.test(s.id)&&(e.push(v.GENERATED_ID),t-=10),ke(s)==="body"&&(e.push(v.NO_LANDMARK),t-=12),_(s)===""&&s.children.length===0&&(e.push(v.EMPTY_TEXT),t-=8),xe(t,e)}function xe(s,e,t){return{confidence:Math.max(0,Math.min(100,Math.round(s))),reasons:e,repeater:t}}function nt(s){return{tag:s.tagName,textHash:Ee(_(s)),attrHash:Ee(at(s)),index:ot(s),landmark:ke(s)}}function we(s){let e=Array.from(s.classList).sort().join("."),t=Array.from(s.children).map(i=>i.tagName).join(",");return`${s.tagName}|${e}|${t}`}function st(s){let e=s.parentElement;if(!e)return[s];let t=we(s);return Array.from(e.children).filter(i=>i.tagName===s.tagName&&we(i)===t)}function ot(s){let e=s.parentElement;if(!e)return 0;let t=0;for(let i of Array.from(e.children)){if(i===s)return t;i.tagName===s.tagName&&t++}return t}function ke(s){let e=s.parentElement;for(;e&&e!==document.body&&e!==document.documentElement;){if(e.matches(it)){if(e.id&&!ie.test(e.id))return`#${V(e.id)}`;let t=e.getAttribute("aria-label");if(t)return`${e.tagName.toLowerCase()}[aria-label="${V(t)}"]`;let i=e.getAttribute("role");return i?`${e.tagName.toLowerCase()}[role="${V(i)}"]`:e.tagName.toLowerCase()}e=e.parentElement}return"body"}function rt(s){let e=[],t=s;for(;t&&t!==document.body&&t!==document.documentElement;){if(t.id&&!ie.test(t.id)&&/^[A-Za-z][\w-]*$/.test(t.id))return e.unshift(`#${V(t.id)}`),e.join(" > ");let i=t.tagName.toLowerCase(),n=1,r=t.parentElement;if(r)for(let o of Array.from(r.children)){if(o===t)break;o.tagName===t.tagName&&n++}e.unshift(`${i}:nth-of-type(${n})`),t=t.parentElement}}function at(s){return["class","role","type","name","aria-label","href","alt"].map(t=>{let i=s.getAttribute(t);return i?t==="class"?"class="+Array.from(s.classList).filter(n=>!/^[a-z]+-[a-f0-9]{5,}$|^css-|^sc-/i.test(n)).sort().join("."):`${t}=${i}`:""}).filter(Boolean).join("|")}function _(s){return(s.textContent??"").replace(/\s+/g," ").trim().slice(0,512)}function Ee(s){let e=5381;for(let t=0;t<s.length;t++)e=(e<<5)+e+s.charCodeAt(t)|0;return(e>>>0).toString(36)}function V(s){return typeof CSS<"u"&&CSS.escape?CSS.escape(s):s.replace(/[^\w-]/g,"\\$&")}function se(s){return s.reasons.includes(v.SHADOW)||s.reasons.includes(v.IFRAME)?"This element is inside a shadow DOM / iframe \u2014 Weblay may not reach it reliably.":s.repeater?`This is item ${s.repeater.index+1} of ${s.repeater.count} similar items. If the list reorders or is data-driven, this edit may move \u2014 add data-weblay="\u2026" to lock it.`:s.reasons.includes(v.GENERATED_ID)?"This element's id looks build-generated (unstable). Weblay will use other signals; consider a data-weblay tag.":s.reasons.includes(v.NO_LANDMARK)?"No semantic ancestor nearby \u2014 re-matching after markup changes is less certain. A data-weblay tag makes it permanent.":null}var oe=new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE","BR","LINK","META","HEAD"]),lt=1500,dt=2,q=class{constructor(e,t,i){this.pageDoc=t;this.handlers=i;this.open=!1;this.revealHidden=!1;this.editedOnly=!1;this.filter="";this.seeded=!1;this.expanded=new Set;this.rowMap=new WeakMap;this.selectedEl=null;this.host=e.createElement("div"),this.host.setAttribute("data-weblay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),this.build(),e.body.appendChild(this.host)}view(){return this.pageDoc.defaultView??window}destroy(){this.host.remove()}toggle(){return this.open=!this.open,this.host.style.display=this.open?"block":"none",this.open&&(this.render(),this.selectedEl&&this.markSelected(this.selectedEl)),this.open}isOpen(){return this.open}close(){this.open&&(this.open=!1,this.host.style.display="none",this.handlers.onClose?.())}refresh(){this.open&&this.render()}markSelected(e){if(this.selectedEl=e,!this.open)return;if(e){let i=e.parentElement;for(;i&&i!==this.pageDoc.body;)this.expanded.add(i),i=i.parentElement;this.render()}for(let i of Array.from(this.shadow.querySelectorAll(".ln.sel")))i.classList.remove("sel");if(!e)return;let t=this.rowMap.get(e);t&&(t.classList.add("sel"),t.scrollIntoView({block:"center",behavior:"smooth"}))}markHover(e){if(this.open){for(let t of Array.from(this.shadow.querySelectorAll(".ln.hov")))t.classList.remove("hov");e&&this.rowMap.get(e)?.classList.add("hov")}}build(){this.shadow.innerHTML=`
      <style>
        :host { all: initial; }
        .wrap { position: fixed; top: 0; left: 0; bottom: 0; width: 320px; z-index: 2147483646;
          background: #0b0d17; border-right: 1px solid #272a3a; color: #e5e7eb;
          display: flex; flex-direction: column;
          font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .head { padding: 13px 13px 11px; border-bottom: 1px solid #1a1d2e; display: flex; flex-direction: column; gap: 10px; }
        .title { display: flex; align-items: center; gap: 8px; }
        .title b { font-size: 13px; letter-spacing: .06em; color: #a5b4fc; }
        .title .n { font-size: 12px; color: #6b7280; flex: 1; }
        .title .x { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
          border: 0; border-radius: 7px; background: none; color: #6b7280; cursor: pointer; }
        .title .x:hover { background: #1f2333; color: #e5e7eb; }
        .title .x svg { width: 15px; height: 15px; }
        .filter { display: flex; align-items: center; gap: 7px; background: #161824; border: 1px solid #272a3a;
          border-radius: 8px; padding: 7px 10px; }
        .filter:focus-within { border-color: #6366f1; }
        .filter svg { width: 14px; height: 14px; color: #6b7280; flex: 0 0 auto; }
        .filter input { all: unset; flex: 1; color: #e5e7eb; font-size: 13.5px; min-width: 0; }
        .filter input::placeholder { color: #4b5563; }
        .toggles { display: flex; gap: 16px; }
        .tg { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #9ca3af; cursor: pointer; user-select: none; }
        .tg input { accent-color: #6366f1; margin: 0; }
        .tree { flex: 1; overflow: auto; padding: 6px 0 12px; }
        .ln { display: flex; align-items: center; gap: 5px; padding: 4px 12px 4px 0; cursor: pointer; white-space: nowrap; border-radius: 0; }
        .ln:hover { background: #161824; }
        .ln.hov { background: #161e2e; }
        .ln.sel { background: #312e81; }
        .ln.sel .tag { color: #fff; }
        .caret { width: 15px; height: 15px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
          color: #6b7280; cursor: pointer; transition: transform .12s; font-size: 10px; }
        .caret.open { transform: rotate(90deg); }
        .caret.leaf { visibility: hidden; }
        .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: transparent; }
        .dot.ov { background: #818cf8; }
        .dot.hid { background: #4b5563; }
        .tag { color: #c7d2fe; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; flex: 0 0 auto; }
        .hint { color: #6b7280; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; }
        .badge { font-size: 10px; padding: 1px 6px; border-radius: 5px; flex: 0 0 auto; }
        .badge.ov { color: #c7d2fe; background: #312e81; }
        .badge.hid { color: #9ca3af; background: #1f2333; }
        .empty { color: #6b7280; padding: 24px 14px; font-size: 13px; text-align: center; }
        mark { background: #6366f1; color: #fff; border-radius: 2px; }
      </style>
      <div class="wrap">
        <div class="head">
          <div class="title"><b>LAYERS</b><span class="n" id="count"></span>
            <button class="x" id="close" title="Close layers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6 18 18M18 6 6 18"/></svg></button>
          </div>
          <div class="filter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input id="filter" type="text" placeholder="Filter by tag, class, text\u2026" spellcheck="false" />
          </div>
          <div class="toggles">
            <label class="tg"><input type="checkbox" id="edited" /> Edited only</label>
            <label class="tg"><input type="checkbox" id="reveal" /> Show hidden</label>
          </div>
        </div>
        <div class="tree" id="tree"></div>
      </div>`,this.treeEl=this.shadow.getElementById("tree"),this.filterEl=this.shadow.getElementById("filter"),this.countEl=this.shadow.getElementById("count"),this.host.style.display="none",this.filterEl.addEventListener("input",()=>{this.filter=this.filterEl.value.trim().toLowerCase(),this.render()}),this.shadow.getElementById("edited").addEventListener("change",e=>{this.editedOnly=e.target.checked,this.render()}),this.shadow.getElementById("reveal").addEventListener("change",e=>{this.revealHidden=e.target.checked,this.pageDoc.documentElement.classList.toggle("weblay-reveal-hidden",this.revealHidden),this.render()}),this.treeEl.addEventListener("mouseleave",()=>this.handlers.onHover(null)),this.shadow.getElementById("close").addEventListener("click",()=>this.close())}render(){let e=this.handlers.overrideSelectors();this.treeEl.innerHTML="",this.rowMap=new WeakMap;let t=this.filter!==""||this.editedOnly,i=t?this.computeVisible(e):null,n=0,r=(o,a)=>{if(n>=lt||oe.has(o.tagName)||o.closest("[data-weblay-ui]")||i&&!i.has(o))return;let l=Array.from(o.children).filter(b=>b instanceof HTMLElement&&!oe.has(b.tagName)),p=l.length>0;!this.seeded&&p&&a<dt&&this.expanded.add(o);let c=t||this.expanded.has(o),d=this.isHidden(o),g=o.classList.contains("weblay-editable")||o.tagName==="IMG"?this.safeSelector(o):"",y=!!g&&e.has(g);n++;let u=document.createElement("div");if(u.className="ln",u.style.paddingLeft=`${8+a*13}px`,u.innerHTML=`
        <span class="caret ${p?c?"open":"":"leaf"}">\u25B6</span>
        <span class="dot ${y?"ov":d?"hid":""}"></span>
        <span class="tag">${o.tagName.toLowerCase()}</span>
        <span class="hint">${this.hint(o)}</span>
        ${y?'<span class="badge ov">edited</span>':""}
        ${d?'<span class="badge hid">hidden</span>':""}`,u.querySelector(".caret").addEventListener("click",b=>{b.stopPropagation(),!(!p||t)&&(this.expanded.has(o)?this.expanded.delete(o):this.expanded.add(o),this.render())}),u.addEventListener("click",b=>{b.stopPropagation(),this.handlers.onSelect(o)}),u.addEventListener("mouseenter",()=>this.handlers.onHover(o)),this.treeEl.appendChild(u),this.rowMap.set(o,u),o===this.selectedEl&&u.classList.add("sel"),c)for(let b of l)r(b,a+1)};if(this.pageDoc.body)for(let o of Array.from(this.pageDoc.body.children))o instanceof HTMLElement&&r(o,0);this.seeded=!0,this.countEl.textContent=n?`${n}`:"",n===0&&(this.treeEl.innerHTML=`<div class="empty">${t?"No matching elements.":"No elements."}</div>`)}computeVisible(e){let t=new Set,i=this.pageDoc.body?Array.from(this.pageDoc.body.querySelectorAll("*")):[];for(let n of i){if(oe.has(n.tagName)||n.closest("[data-weblay-ui]")||!this.matches(n,e))continue;let r=n;for(;r&&r!==this.pageDoc.body;)t.add(r),r=r.parentElement}return t}matches(e,t){if(this.editedOnly){let i=e.classList.contains("weblay-editable")||e.tagName==="IMG"?this.safeSelector(e):"";if(!i||!t.has(i))return!1}return!(this.filter&&!`${e.tagName} ${e.id} ${e.className} ${(e.textContent??"").slice(0,80)}`.toLowerCase().includes(this.filter))}hint(e){let t="";if(e.id)t=`#${e.id}`;else{let i=Array.from(e.classList).filter(n=>!n.startsWith("weblay-"))[0];if(i)t=`.${i}`;else{let n=(e.textContent??"").trim().replace(/\s+/g," ");n&&(t=`"${n.slice(0,22)}"`)}}if(this.filter&&t){let i=t.toLowerCase().indexOf(this.filter);if(i>=0)return K(t.slice(0,i))+"<mark>"+K(t.slice(i,i+this.filter.length))+"</mark>"+K(t.slice(i+this.filter.length))}return K(t)}isHidden(e){if(e.hidden)return!0;let t=this.view().getComputedStyle(e);return t.display==="none"||t.visibility==="hidden"||e.offsetParent===null&&t.position!=="fixed"}safeSelector(e){try{return this.handlers.selectorFor(e)}catch{return""}}};function K(s){return s.replace(/[&<>"]/g,e=>`&#${e.charCodeAt(0)};`)}var ct=new Set(["P","H1","H2","H3","H4","H5","H6","SPAN","A","LI","BLOCKQUOTE","BUTTON","FIGCAPTION","TD","TH","DT","DD","LABEL","SMALL","STRONG","EM"]),pt=new Set(["DIV","SECTION","ARTICLE","ASIDE","HEADER","FOOTER","MAIN","NAV","UL","OL","FORM","FIGURE","FIELDSET","PICTURE","TABLE","TR"]),ht=new Set(["A","B","STRONG","I","EM","U","S","STRIKE","DEL","INS","CODE","MARK","SUB","SUP","SMALL","SPAN","BR","ABBR","Q","FONT","WBR","TIME","CITE","VAR","KBD","SAMP"]),ut={b:"bold",i:"italic",u:"underline",k:"createLink"};function re(s){return JSON.parse(JSON.stringify(s??{}))}function mt(s){return!s||s.text===void 0&&s.html===void 0&&!(s.attrs&&Object.keys(s.attrs).length)&&!(s.style&&Object.keys(s.style).length)&&!(s.media&&Object.values(s.media).some(e=>Object.keys(e).length))}function gt(s){let e=new Set(Object.keys(s.style??{}));for(let t of Object.values(s.media??{}))for(let i of Object.keys(t))e.add(i);return e}var Y=class{constructor(e,t,i){this.editorName=i;this.dirty=new Map;this.committed=new Map;this.saving=!1;this.unpublished=0;this.pubCount=null;this.selectedEl=null;this.selectedIsImage=!1;this.textActive=null;this.originalHTML="";this.undoStack=[];this.redoStack=[];this.applyingHistory=!1;this.previewW=1/0;this.activeMax=0;this.publishedVersion=0;this.descriptors=new Map;this.origState=new Map;this.peeking=!1;this.peekSticky=!1;this.layerHover=null;this.rebinding=null;this.rebindHost=null;this.rebindHover=null;this.onRebindHover=e=>{let t=Le(e.target);t!==this.rebindHover&&(this.rebindHover?.classList.remove("weblay-rebind-hover"),this.rebindHover=t,this.rebindHover?.classList.add("weblay-rebind-hover"))};this.onRebindClick=e=>{let t=Le(e.target);t&&(e.preventDefault(),e.stopPropagation(),this.doRebind(t))};this.onTextClick=e=>{let t=e.currentTarget;t.tagName==="A"&&(e.metaKey||e.ctrlKey)||(e.preventDefault(),e.stopPropagation(),this.beginTextEdit(t))};this.onTextKeydown=e=>{if((e.metaKey||e.ctrlKey)&&!e.altKey){let t=ut[e.key.toLowerCase()];if(t){e.preventDefault(),this.toolbar.run(t);return}return}e.key==="Escape"?(e.preventDefault(),this.textActive&&(this.textActive.innerHTML=this.originalHTML),this.textActive?.blur()):e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),this.textActive?.blur())};this.onTextBlur=e=>{let t=e.currentTarget;t.removeAttribute("contenteditable"),t.classList.remove("weblay-editing"),t.removeEventListener("keydown",this.onTextKeydown),this.toolbar.setEditable(null),this.toolbar.hide(),t.innerHTML!==this.originalHTML&&this.persistRichText(m(t),t),this.textActive=null};this.onImageClick=e=>{let t=e.currentTarget;e.preventDefault(),e.stopPropagation(),this.selectedEl!==t&&(this.deselect(),this.selectedEl=t,t.classList.add("weblay-selected"),this.showPanel(t,m(t),!0))};this.onContainerClick=e=>{e.preventDefault(),e.stopPropagation(),this.selectContainer(e.currentTarget)};this.onDocClick=e=>{let t=e.target instanceof HTMLElement?e.target:null;t&&(t.closest("[data-weblay-ui]")||t.closest(".weblay-editable")||this.deselect())};this.hovered=null;this.onHover=e=>{let i=e.target?.closest?.(".weblay-editable"),n=i&&!i.closest("[data-weblay-ui]")?i:null;n!==this.hovered&&(this.hovered?.classList.remove("weblay-hover"),this.hovered=n,this.hovered?.classList.add("weblay-hover"),this.layers?.isOpen()&&this.layers.markHover(n))};this.onSelectionChange=()=>{this.textActive&&this.toolbar.syncFromSelection()};this.onGlobalKeydown=e=>{if(!(e.metaKey||e.ctrlKey)||e.key.toLowerCase()!=="z"||this.textActive)return;let t=e.target;t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))||(e.preventDefault(),e.shiftKey?this.redo():this.undo())};this.markPreset=()=>{};this.api=new x(e,t)}async start(){this.progress=new U(this.topDoc()),this.progress.busy("Loading editor\u2026");let e=await this.api.drafts();this.publishedVersion=e.publishedVersion??0;for(let[i,n]of Object.entries(e.elements))this.committed.set(i,n),this.snapshotOriginal(i,n),R(i,n);this.panel=new D,this.toolbar=new j({onChange:()=>this.onRichChange()}),this.handles=new O(i=>{if(!this.selectedEl)return;let n=m(this.selectedEl);this.commitStyle(n,"width",`${i.widthPx}px`),this.commitStyle(n,"height",`${i.heightPx}px`)}),this.spacing=new z(()=>{},(i,n)=>{this.selectedEl&&this.commitStyle(m(this.selectedEl),i,`${n}px`)}),this.layers=new q(this.topDoc(),document,{onSelect:i=>this.selectFromLayers(i),onHover:i=>this.setLayerHover(i),onClose:()=>{this.layersBtn?.classList.remove("on"),this.shiftStageForLayers(!1)},overrideSelectors:()=>new Set([...this.committed.keys(),...this.dirty.keys()]),selectorFor:i=>m(i)}),this.injectStyles(),this.buildBar(),this.markEditable(),this.setStatus("No unsaved changes"),document.addEventListener("click",this.onDocClick,!0),document.addEventListener("selectionchange",this.onSelectionChange),document.addEventListener("keydown",this.onGlobalKeydown,!0),document.addEventListener("mouseover",this.onHover,!0),this.progress.ok("Editor ready");let t=sessionStorage.getItem("weblay:rebind");t&&(sessionStorage.removeItem("weblay:rebind"),this.enterRebind(t))}enterRebind(e){let t=this.dirty.get(e)??this.committed.get(e);if(!t){this.toast("That override's content couldn't be found \u2014 edit the element directly instead.",!0);return}this.deselect(),this.rebinding={oldSelector:e,content:t},this.buildRebindBanner(t),document.addEventListener("mouseover",this.onRebindHover,!0),document.addEventListener("click",this.onRebindClick,!0),this.progress.busy("Re-bind: click the element this edit belongs to")}buildRebindBanner(e){let t=this.topDoc(),i=t.createElement("div");i.setAttribute("data-weblay-ui","");let n=i.attachShadow({mode:"open"}),r=T((e.text??e.html??"(styles/attributes)").replace(/<[^>]+>/g," ").trim().slice(0,60));n.innerHTML=`
      <style>
        :host { all: initial; }
        .bar { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
          display: flex; align-items: center; gap: 12px; max-width: 92vw;
          background: #2e1065; color: #ddd6fe; border: 1px solid #6d28d9; border-radius: 12px;
          padding: 10px 14px; box-shadow: 0 12px 40px rgba(0,0,0,.5);
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        b { color: #fff; }
        .prev { color: #c4b5fd; font-style: italic; max-width: 30vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        button { font: inherit; border: 0; border-radius: 8px; padding: 6px 12px; cursor: pointer;
          background: rgba(255,255,255,.12); color: #fff; }
        button:hover { background: rgba(255,255,255,.22); }
      </style>
      <div class="bar">
        <b>Re-binding</b><span class="prev">"${r}"</span>
        <span>\u2014 click the element it should apply to</span>
        <button id="cancel">Cancel</button>
      </div>`,n.getElementById("cancel").addEventListener("click",()=>this.exitRebind()),t.body.appendChild(i),this.rebindHost=i}async doRebind(e){if(!this.rebinding)return;let{oldSelector:t,content:i}=this.rebinding,n=m(e);if(n===t){this.toast("That's the same element.",!1);return}let r=se(G(e));if(await this.confirmDialog(`Re-bind to this <${e.tagName.toLowerCase()}>?`,`The override will move to this element and publish.${r?" "+r:""}`,"Re-bind here")){this.progress.busy("Re-binding\u2026");try{let a=ne(e),l=G(e);await this.api.saveDraft(n,i,a,l),await this.api.removeOverride(t),await this.api.publish(),this.progress.ok("Re-bound & published"),this.toast("Override re-bound to the new element","success"),this.exitRebind(),setTimeout(()=>(window.top??window).location.reload(),700)}catch(a){this.progress.err("Re-bind failed"),this.toast(`Re-bind failed: ${a.message}`,!0)}}}exitRebind(){document.removeEventListener("mouseover",this.onRebindHover,!0),document.removeEventListener("click",this.onRebindClick,!0),this.rebindHover?.classList.remove("weblay-rebind-hover"),this.rebindHost?.remove(),this.rebindHost=null,this.rebindHover=null,this.rebinding=null,this.progress.hide()}markEditable(){for(let e of Array.from(document.body.querySelectorAll("*")))if(!e.closest("[data-weblay-ui]")){if(e.tagName==="IMG"){e.classList.add("weblay-editable","weblay-img"),e.addEventListener("click",this.onImageClick);continue}if(ct.has(e.tagName)&&this.isTextEditable(e)){e.classList.add("weblay-editable"),e.addEventListener("click",this.onTextClick);continue}pt.has(e.tagName)&&(e.classList.add("weblay-editable","weblay-box"),e.addEventListener("click",this.onContainerClick))}}isTextEditable(e){return(e.textContent??"").trim().length>0&&this.hasOnlyInline(e)}hasOnlyInline(e){for(let t of Array.from(e.children))if(!ht.has(t.tagName)||!this.hasOnlyInline(t))return!1;return!0}beginTextEdit(e){this.selectedEl===e&&this.textActive===e||(this.deselect(),this.selectedEl=e,this.textActive=e,this.originalHTML=e.innerHTML,this.recordOrigHtml(m(e),e),e.setAttribute("contenteditable","true"),e.classList.add("weblay-editing"),e.focus(),e.addEventListener("blur",this.onTextBlur,{once:!0}),e.addEventListener("keydown",this.onTextKeydown),this.toolbar.setEditable(e),this.showPanel(e,m(e),!1))}showPanel(e,t,i){this.selectedIsImage=i;let n=this.captureDescriptor(e,t),r=this.contentFor(t),o={...r,style:this.effectiveStyle(r,this.previewW)},a=!i&&this.hasSelectableParent(e);this.panel.show(e,o,{onAttr:(l,p)=>this.handleAttrChange(t,e,l,p),onStyle:(l,p)=>this.commitStyle(t,l,p),onUpload:l=>void this.uploadAndReplace(e,t,l),onTab:l=>this.syncOverlays(l),onParent:a?()=>this.selectParent(e):void 0,onPeek:this.origState.has(t)?l=>this.peekElement(t,l):void 0,onReset:()=>void this.resetElement(t),hasOverride:this.dirty.has(t)||this.committed.has(t)},i,this.activeMax>0?`\u2264 ${this.activeMax}px`:null,se(n)),this.syncOverlays("a"),this.layers?.markSelected(e)}captureDescriptor(e,t){let i=ne(e),n=G(e);return this.descriptors.set(t,{descriptor:i,risk:n}),n}syncOverlays(e){let t=this.selectedEl;t&&(e==="s"?(this.handles.detach(),this.spacing.attach(t)):(this.spacing.detach(),this.selectedIsImage&&t instanceof HTMLImageElement?this.handles.attach(t):this.handles.detach()))}hasSelectableParent(e){let t=e.parentElement;for(;t&&t!==document.body;){if(t.classList.contains("weblay-editable")&&!t.closest("[data-weblay-ui]"))return!0;t=t.parentElement}return!1}onRichChange(){if(!this.textActive)return;let e=m(this.textActive);this.persistRichText(e,this.textActive)}persistRichText(e,t){let i=A(t.innerHTML);ue(i)?this.patchDirty(e,{text:t.textContent??"",html:null}):this.patchDirty(e,{html:i}),this.scheduleSave()}selectContainer(e){this.selectedEl!==e&&(this.deselect(),this.selectedEl=e,e.classList.add("weblay-selected"),this.showPanel(e,m(e),!1))}selectFromLayers(e){e.classList.add("weblay-force-visible");try{e.scrollIntoView({block:"center",behavior:"smooth"})}catch{}e.tagName==="IMG"?(this.deselect(),this.selectedEl=e,e.classList.add("weblay-selected"),this.showPanel(e,m(e),!0)):this.isTextEditable(e)?this.beginTextEdit(e):this.selectContainer(e)}selectParent(e){let t=e.parentElement;for(;t&&t!==document.body;){if(t.classList.contains("weblay-editable")&&!t.closest("[data-weblay-ui]")){this.selectContainer(t);return}t=t.parentElement}}async uploadAndReplace(e,t,i){this.setStatus("Uploading image\u2026"),this.progress.busy("Uploading image\u2026");try{let{url:n}=await this.api.upload(i);this.recordOrigAttr(t,e,"src"),this.recordOrigAttr(t,e,"srcset"),e.src=n,e.removeAttribute("srcset"),this.handleAttrChange(t,e,"src",n),this.handleAttrChange(t,e,"srcset",""),this.progress.ok("Image updated")}catch(n){this.progress.err("Upload failed"),this.toast(`Upload failed: ${n.message}`,!0),this.setStatus("Upload failed")}}snapshotOriginal(e,t){if(this.origState.has(e))return;let i=null;try{i=document.querySelector(e)}catch{return}if(!i)return;let n={};if((t.text!==void 0||t.html!==void 0)&&(n.html=i.innerHTML),t.attrs){n.attrs={};for(let r of Object.keys(t.attrs))n.attrs[r]=i.getAttribute(r)}(t.style||t.media)&&(n.style=i.getAttribute("style")),this.origState.set(e,n)}origFor(e){let t=this.origState.get(e);return t||(t={},this.origState.set(e,t)),t}recordOrigHtml(e,t){let i=this.origFor(e);i.html===void 0&&(i.html=t.innerHTML)}recordOrigAttr(e,t,i){let n=this.origFor(e);n.attrs||(n.attrs={}),i in n.attrs||(n.attrs[i]=t.getAttribute(i))}recordOrigStyle(e,t){let i=this.origFor(e);i.style===void 0&&(i.style=t.getAttribute("style"))}restoreOriginal(e){let t=this.origState.get(e),i=null;try{i=document.querySelector(e)}catch{return}if(!(!i||!t)){if(t.html!==void 0&&(i.innerHTML=t.html),t.attrs)for(let[n,r]of Object.entries(t.attrs))r===null?i.removeAttribute(n):i.setAttribute(n,r);t.style!==void 0&&(t.style===null?i.removeAttribute("style"):i.setAttribute("style",t.style))}}reapplyOverride(e){let t=this.dirty.get(e)??this.committed.get(e);t&&R(e,t),this.refreshPreview(e)}togglePeek(e){if(e!==this.peeking){this.peeking=e,e&&this.deselect();for(let t of new Set([...this.origState.keys(),...this.committed.keys(),...this.dirty.keys()]))e?this.restoreOriginal(t):this.reapplyOverride(t);this.setPeekButton(e),this.setStatus(e?"Peeking original \u2014 edits hidden":"No unsaved changes")}}peekElement(e,t){t?this.restoreOriginal(e):this.reapplyOverride(e)}async resetElement(e){if(await this.confirmReset("Reset this element?","This removes your override and publishes the original content live. You can restore it from version history.")){this.progress.busy("Resetting\u2026");try{await this.api.resetElement(e),this.restoreOriginal(e),this.dirty.delete(e),this.committed.delete(e),this.origState.delete(e),this.descriptors.delete(e),this.undoStack=[],this.redoStack=[],this.deselect(),this.layers?.refresh(),this.progress.ok("Reset to original"),this.toast("Element reset \u2014 original is live","success")}catch(i){this.progress.err("Reset failed"),this.toast(`Reset failed: ${i.message}`,!0)}}}handleAttrChange(e,t,i,n){this.recordOrigAttr(e,t,i),n===""?t.removeAttribute(i):t.setAttribute(i,n),this.patchDirty(e,{attrs:{[i]:n}}),this.scheduleSave()}commitStyle(e,t,i){if(!L(t)||!k(i))return;let n=document.querySelector(e);n&&this.recordOrigStyle(e,n),this.activeMax<=0?this.patchDirty(e,{style:{[t]:i}}):this.patchDirty(e,{media:{[String(this.activeMax)]:{[t]:i}}}),this.refreshPreview(e),this.scheduleSave()}effectiveStyle(e,t){let i={...e.style??{}},n=e.media??{},r=Object.keys(n).map(o=>[o,parseInt(o,10)]).filter(([,o])=>Number.isFinite(o)&&o>=t).sort((o,a)=>a[1]-o[1]);for(let[o]of r)Object.assign(i,n[o]);return i}refreshPreview(e){let t=e?[e]:this.editedSelectors();for(let i of t){let n=this.contentFor(i),r=null;try{r=document.querySelector(i)}catch{continue}if(!r)continue;let o=this.effectiveStyle(n,this.previewW),a=new Set(Object.keys(n.style??{}));for(let l of Object.values(n.media??{}))for(let p of Object.keys(l))a.add(p);for(let l of a){let p=o[l];p&&p!==""&&L(l)&&k(p)?r.style.setProperty(l,p):r.style.removeProperty(l)}}}editedSelectors(){return Array.from(new Set([...this.dirty.keys(),...this.committed.keys()]))}contentFor(e){return this.dirty.get(e)??this.committed.get(e)??{}}patchDirty(e,t){let i=this.dirty.has(e)||this.committed.has(e),n=this.dirty.get(e)??this.committed.get(e)??{},r=re(n),o={...n};if(t.text!==void 0&&(o.text=t.text,delete o.html),t.html!==void 0&&(t.html===null?delete o.html:(o.html=t.html,delete o.text)),t.attrs&&(o.attrs={...o.attrs??{},...t.attrs}),t.style&&(o.style={...o.style??{},...t.style}),t.media){o.media={...o.media??{}};for(let[a,l]of Object.entries(t.media))o.media[a]={...o.media[a]??{},...l}}this.dirty.set(e,o),this.applyingHistory||this.pushHistory(e,r,re(o)),i||this.layers?.refresh()}pushHistory(e,t,i){JSON.stringify(t)!==JSON.stringify(i)&&(this.undoStack.push({selector:e,before:t,after:i}),this.undoStack.length>200&&this.undoStack.shift(),this.redoStack=[])}undo(){let e=this.undoStack.pop();if(!e){this.toast("Nothing to undo",!1);return}this.redoStack.push(e),this.applyHistory(e.selector,e.before,e.after),this.toast("Undo")}redo(){let e=this.redoStack.pop();if(!e){this.toast("Nothing to redo",!1);return}this.undoStack.push(e),this.applyHistory(e.selector,e.after,e.before),this.toast("Redo")}applyHistory(e,t,i){this.applyingHistory=!0;try{this.deselect();let n=document.querySelector(e);if(n){this.renderContentDiff(n,t,i);for(let r of gt(i))n.style.removeProperty(r)}mt(t)?(this.dirty.delete(e),this.committed.delete(e),this.api.removeOverride(e).catch(()=>{}),this.setStatus("Draft saved")):(this.dirty.set(e,re(t)),this.scheduleSave()),this.refreshPreview(e)}finally{this.applyingHistory=!1}}renderContentDiff(e,t,i){typeof t.html=="string"?e.innerHTML=A(t.html):typeof t.text=="string"&&(e.textContent=t.text);let n=i.attrs??{},r=t.attrs??{};for(let o of Object.keys(n))o in r||e.removeAttribute(o);for(let[o,a]of Object.entries(r))a===""?e.removeAttribute(o):e.setAttribute(o,a)}deselect(){this.textActive&&this.textActive.blur(),this.selectedEl&&(this.selectedEl.classList.remove("weblay-selected","weblay-force-visible"),this.selectedEl=null),this.selectedIsImage=!1,this.handles.detach(),this.spacing.detach(),this.panel.hide(),this.layers?.markSelected(null)}scheduleSave(){this.setStatus(`${this.dirty.size} unsaved change${this.dirty.size===1?"":"s"}\u2026`),this.updatePublishBadge(),clearTimeout(this.saveTimer),this.saveTimer=window.setTimeout(()=>void this.flush(),600)}async flush(){if(this.saving||this.dirty.size===0)return;this.saving=!0;let e=new Map(this.dirty);this.dirty.clear(),this.progress?.busy("Saving\u2026");try{for(let[t,i]of e){let n=this.descriptors.get(t);await this.api.saveDraft(t,i,n?.descriptor,n?.risk),this.committed.set(t,i)}this.unpublished+=e.size,this.dirty.size===0?(this.setStatus("Draft saved"),this.progress?.ok("Saved")):this.progress?.busy("Saving\u2026")}catch(t){for(let[i,n]of e)this.dirty.has(i)||this.dirty.set(i,n);this.toast(`Save failed: ${t.message}`,!0),this.setStatus("Save failed \u2014 changes kept locally"),this.progress?.err("Save failed")}finally{this.saving=!1,this.updatePublishBadge()}}async saveDraftNow(){if(this.textActive&&this.textActive.blur(),clearTimeout(this.saveTimer),this.dirty.size===0&&this.unpublished===0){this.progress.ok("Nothing to save"),this.toast("Nothing to save",!1);return}let e=this.dirty.size;await this.flush(),this.dirty.size===0&&(e===0&&this.progress.ok("Draft is up to date"),this.toast(e>0?"Draft saved":"Draft is up to date","success"))}async discardDraft(){if(this.textActive&&this.textActive.blur(),clearTimeout(this.saveTimer),!!await this.confirmDialog("Discard unpublished changes?","This reverts the page to its last published version. Your unpublished draft edits will be lost. Published content stays live.","Discard changes")){this.setStatus("Discarding\u2026"),this.progress.busy("Discarding\u2026");try{this.dirty.clear(),await this.api.discard(),this.undoStack=[],this.redoStack=[],this.progress.ok("Draft discarded"),this.toast("Draft discarded \u2014 reverting to published","success"),setTimeout(()=>(window.top??window).location.reload(),700)}catch(t){this.progress.err("Discard failed"),this.toast(`Discard failed: ${t.message}`,!0),this.setStatus("Discard failed")}}}confirmReset(e,t){return this.confirmDialog(e,t,"Reset to original")}confirmDialog(e,t,i){return new Promise(n=>{let r=this.topDoc(),o=r.createElement("div");o.setAttribute("data-weblay-ui","");let a=o.attachShadow({mode:"open"});a.innerHTML=`
        <style>
          :host { all: initial; }
          .scrim { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.55);
            display: flex; align-items: center; justify-content: center;
            font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .box { width: 360px; max-width: 90vw; background: #0b0d17; color: #e5e7eb;
            border: 1px solid #272a3a; border-radius: 14px; padding: 22px; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
          h3 { margin: 0 0 8px; font-size: 16px; }
          p { margin: 0 0 18px; color: #9ca3af; font-size: 13px; line-height: 1.5; }
          .row { display: flex; gap: 10px; justify-content: flex-end; }
          button { font: inherit; border: 0; border-radius: 9px; padding: 9px 16px; cursor: pointer; }
          .cancel { background: #1f2333; color: #d1d5db; }
          .cancel:hover { background: #2a2f45; }
          .confirm { background: #dc2626; color: #fff; font-weight: 600; }
          .confirm:hover { background: #ef4444; }
        </style>
        <div class="scrim">
          <div class="box" role="dialog" aria-modal="true">
            <h3>${T(e)}</h3>
            <p>${T(t)}</p>
            <div class="row">
              <button class="cancel" id="c">Cancel</button>
              <button class="confirm" id="k">${T(i)}</button>
            </div>
          </div>
        </div>`;let l=p=>{o.remove(),n(p)};a.getElementById("c").addEventListener("click",()=>l(!1)),a.getElementById("k").addEventListener("click",()=>l(!0)),a.querySelector(".scrim").addEventListener("click",p=>{p.target===p.currentTarget&&l(!1)}),r.body.appendChild(o)})}async publish(){if(this.textActive&&this.textActive.blur(),await this.flush(),this.dirty.size>0){this.toast("Fix the failed save before publishing",!0);return}this.setStatus("Publishing\u2026"),this.progress.busy("Publishing\u2026");try{let{version:e}=await this.api.publish();this.publishedVersion=e,this.unpublished=0,this.updatePublishBadge(),this.setStatus("Published \xB7 up to date"),this.progress.ok(`Published v${e}`),this.toast(`Published \u2014 version ${e} is now live`,"success")}catch(e){this.progress.err("Publish failed"),this.toast(`Publish failed: ${e.message}`,!0),this.setStatus("Publish failed")}}setPeekButton(e){this.peekBtn?.classList.toggle("on",e)}shiftStageForLayers(e){let i=window.frameElement?.parentElement;if(i){i.style.paddingLeft=e?"320px":"";return}document.documentElement.classList.toggle("weblay-layers-open",e)}setLayerHover(e){e!==this.layerHover&&(this.layerHover?.classList.remove("weblay-layer-hover"),this.layerHover=e,this.layerHover?.classList.add("weblay-layer-hover"))}updatePublishBadge(){if(!this.pubCount)return;let e=this.unpublished+this.dirty.size;this.pubCount.textContent=e>0?` ${e}`:""}async openVersions(){this.textActive&&this.textActive.blur(),await new W(this.topDoc(),{list:()=>this.progress.track("Loading versions\u2026","Versions loaded",()=>this.api.revisions()),liveVersion:()=>this.publishedVersion,onView:t=>this.viewVersion(t),onRestoreDraft:t=>this.restoreAsDraft(t)}).open()}viewVersion(e){this.progress.busy(`Opening version ${e.version}\u2026`),sessionStorage.setItem("weblay:view",e.id),(window.top??window).location.reload()}async restoreAsDraft(e){this.progress.busy(`Restoring version ${e.version}\u2026`);try{await this.api.restoreDraft(e.id)}catch(t){this.progress.err("Restore failed"),this.toast(`Restore failed: ${t.message}`,!0);return}this.progress.ok(`Restored v${e.version} as draft`),this.toast(`Version ${e.version} restored as draft`,"success"),setTimeout(()=>(window.top??window).location.reload(),700)}exit(){sessionStorage.removeItem("weblay:token"),(window.top??window).location.reload()}injectStyles(){let e=document.createElement("style");e.setAttribute("data-weblay-ui",""),e.textContent=`
      .weblay-editable {
        outline: 1.5px dashed rgba(99,102,241,0);
        outline-offset: 2px; transition: outline-color .15s; cursor: pointer;
      }
      .weblay-hover { outline-color: rgba(99,102,241,.8) !important; }
      .weblay-box.weblay-hover { outline-color: rgba(45,212,191,.85) !important; outline-style: dashed; }
      .weblay-editing { outline: 2px solid rgb(99,102,241) !important; cursor: text; }
      .weblay-selected { outline: 2px solid #6366f1 !important; outline-offset: 2px; }
      .weblay-box.weblay-selected { outline-color: #2dd4bf !important; }
      .weblay-img.weblay-hover { filter: brightness(.85); }
      .weblay-rebind-hover { outline: 2px dashed #a78bfa !important; outline-offset: 2px; cursor: crosshair !important; }
      .weblay-layer-hover { outline: 2px solid #818cf8 !important; outline-offset: 1px; }
      /* Pro workspace: shift the page right so the 300px layers panel doesn't cover it. */
      html.weblay-layers-open body { margin-left: 320px !important; transition: margin-left .2s ease; }
      /* Reveal-hidden: force display:none / hidden elements visible so they're selectable. */
      html.weblay-reveal-hidden [hidden],
      html.weblay-reveal-hidden [style*="display: none"],
      html.weblay-reveal-hidden [style*="display:none"] { display: revert !important; }
      .weblay-force-visible { display: revert !important; visibility: visible !important; opacity: 1 !important; }
      ${window.frameElement?"":"body { margin-bottom: 64px !important; }"}
    `,document.head.appendChild(e)}buildBar(){let e=this.topDoc(),t=e.createElement("div");t.setAttribute("data-weblay-ui","");let i=t.attachShadow({mode:"open"});i.innerHTML=`
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        /* 3-column grid keeps the centered device controls dead-centre and stops
           dynamic status/badge text from nudging other controls around. */
        .bar {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
          height: ${52}px; display: grid; grid-template-columns: 1fr auto 1fr;
          align-items: center; gap: 14px; padding: 0 14px;
          background: #0b0d17; color: #e5e7eb; border-top: 1px solid #272a3a;
          font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .grp { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .grp:first-child { justify-self: start; }
        .center { justify-self: center; }
        .right { justify-self: end; }
        .brand { display: inline-flex; align-items: center; gap: 7px; font-weight: 650; color: #e5e7eb; flex: 0 0 auto; }
        .brand .mk { width: 18px; height: 18px; color: #818cf8; }
        .who { color: #6b7280; font-size: 12px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Segmented control (tool groups + device switcher) */
        .seg { display: inline-flex; align-items: center; background: #14162099; border: 1px solid #23263a;
          border-radius: 10px; padding: 3px; gap: 2px; flex: 0 0 auto; }
        .ico { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 30px;
          border: 0; border-radius: 7px; background: none; color: #9ca3af; cursor: pointer; transition: background .12s, color .12s; }
        .ico:hover { background: #22263a; color: #e5e7eb; }
        .ico:disabled { opacity: .4; cursor: default; }
        .ico svg { width: 16px; height: 16px; }
        .ico.on { background: #312e81; color: #c7d2fe; }
        .ico.warn.on { background: #422006; color: #fcd34d; }

        .dev { display: flex; align-items: center; gap: 6px; padding: 6px 11px; border: 0; border-radius: 7px;
          background: none; color: #9ca3af; cursor: pointer; font: 12.5px -apple-system, sans-serif; transition: background .12s, color .12s; }
        .dev:hover { background: #22263a; color: #e5e7eb; }
        .dev.on { background: #312e81; color: #c7d2fe; }
        .dev svg { width: 15px; height: 15px; }
        .dev .lbl { font-weight: 600; }

        .wbox { display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto;
          background: #141620; border: 1px solid #23263a; border-radius: 10px; padding: 3px 6px 3px 9px; }
        .wbox .wlab { color: #6b7280; font-size: 11px; font-weight: 600; }
        .wbox input { all: unset; width: 44px; text-align: center; color: #e5e7eb;
          font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; -moz-appearance: textfield; }
        .wbox input::-webkit-outer-spin-button, .wbox input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .wbox .wunit { color: #6b7280; font-size: 11px; padding-right: 3px; }
        .wstep { width: 22px; height: 24px; border: 0; background: #22263a; color: #9ca3af; cursor: pointer;
          border-radius: 6px; font-size: 14px; line-height: 1; }
        .wstep:hover { background: #2a2f45; color: #e5e7eb; }

        .sep { width: 1px; height: 22px; background: #23263a; flex: 0 0 auto; }
        .status { color: #9ca3af; font-size: 12px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; border: 0; border-radius: 9px;
          padding: 8px 15px; cursor: pointer; transition: background .12s, color .12s; }
        .btn:disabled { opacity: .5; cursor: default; }
        .btn svg { width: 15px; height: 15px; }
        .btn.ghost { background: #1c1f2e; color: #cbd2e0; }
        .btn.ghost:hover:not(:disabled) { background: #262a3d; color: #fff; }
        .btn.primary { background: #6366f1; color: #fff; font-weight: 600; box-shadow: 0 2px 10px rgba(99,102,241,.35);
          min-width: 96px; justify-content: center; }
        .btn.primary:hover:not(:disabled) { background: #818cf8; }
        .btn.primary .cnt { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px;
          padding: 0 5px; border-radius: 999px; background: rgba(255,255,255,.22); font-size: 11px; font-weight: 700; }
        .btn.primary .cnt:empty { display: none; }

        /* Overflow menu */
        .more-wrap { position: relative; }
        .menu { position: absolute; right: 0; bottom: calc(100% + 8px); min-width: 200px;
          background: #12141f; border: 1px solid #2a2f45; border-radius: 12px; padding: 6px;
          box-shadow: 0 16px 44px rgba(0,0,0,.6); display: flex; flex-direction: column; gap: 1px; }
        .menu[hidden] { display: none; }
        .mi { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border: 0; border-radius: 8px;
          background: none; color: #d1d5db; cursor: pointer; font: 13px -apple-system, sans-serif; text-align: left; }
        .mi:hover { background: #1f2333; color: #fff; }
        .mi svg { width: 15px; height: 15px; color: #9ca3af; flex: 0 0 auto; }
        .mi.danger { color: #fca5a5; }
        .mi.danger:hover { background: #3a1d1d; color: #fecaca; }
        .mi.danger svg { color: #fca5a5; }
        .msep { height: 1px; background: #23263a; margin: 4px 6px; }
        .mi kbd { margin-left: auto; font: 11px ui-monospace, monospace; color: #6b7280; }

        .toast {
          position: fixed; bottom: ${70}px; left: 50%; transform: translateX(-50%) translateY(8px);
          display: inline-flex; align-items: center; gap: 9px;
          background: #16a34a; color: #fff; padding: 11px 22px; border-radius: 11px;
          font: 13.5px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-weight: 500;
          box-shadow: 0 10px 30px rgba(0,0,0,.45);
          opacity: 0; transition: opacity .22s, transform .22s; pointer-events: none; max-width: 80vw;
        }
        .toast .tic { display: none; width: 18px; height: 18px; flex: 0 0 auto; }
        .toast.success { background: #16a34a; }
        .toast.success .tic { display: inline-flex; }
        .toast.error { background: #dc2626; }
        .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        @media (max-width: 900px) {
          .who, .status { display: none; }
          .dev .lbl { display: none; }
          .dev { padding: 6px 8px; }
          .btn.ghost .t { display: none; }
          .btn.ghost { padding: 8px 11px; }
        }
        @media (max-width: 640px) {
          .bar { gap: 8px; padding: 0 8px; }
          .wbox { display: none; }
        }
      </style>
      <div class="bar">
        <div class="grp">
          <span class="brand" title="${T(this.editorName)} \xB7 click text or image to edit \xB7 \u2318-click a link to follow it">
            <svg class="mk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16.86 4.49 1.69-1.69a1.88 1.88 0 1 1 2.65 2.65L10.58 16.07a4.5 4.5 0 0 1-1.9 1.13L6 18l.8-2.68a4.5 4.5 0 0 1 1.13-1.9z"/></svg>
            Weblay
          </span>
          <span class="who">Editing as ${T(this.editorName)}</span>
        </div>

        <div class="grp center">
          <div class="seg" role="group" aria-label="View tools">
            <button class="ico" id="layers" title="Layers \u2014 select any element, incl. hidden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>
            </button>
            <button class="ico warn" id="peek" title="Peek original \u2014 hold to preview, double-click to keep">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="seg" id="devices" role="group" aria-label="Preview size">
            ${te.map(d=>`
              <button class="dev${d.id==="desktop"?" on":""}" data-preset="${d.id}" data-pw="${d.previewWidth}" data-mw="${d.maxWidth}" title="${d.label}${d.previewWidth?` \u2014 ${d.previewWidth}px`:""}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d.icon}</svg>
                <span class="lbl">${d.label}</span>
              </button>`).join("")}
          </div>
          <div class="wbox" title="Custom width \u2014 styles you set apply at this width and below">
            <span class="wlab">W</span>
            <button class="wstep" id="wdn" title="Narrower">\u2212</button>
            <input id="wval" type="number" min="240" max="3840" step="10" value="" placeholder="Full" />
            <button class="wstep" id="wup" title="Wider">+</button>
            <span class="wunit">px</span>
          </div>
        </div>

        <div class="grp right">
          <span class="status" id="status"></span>
          <button class="btn ghost" id="savedraft" title="Save draft now">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
            <span class="t">Save</span>
          </button>
          <button class="btn primary" id="publish">Publish<span class="cnt" id="pubcnt"></span></button>
          <div class="more-wrap">
            <button class="ico" id="more" title="More" aria-haspopup="menu" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
            <div class="menu" id="moremenu" role="menu" hidden>
              <button class="mi" id="versions" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
                Version history
              </button>
              <button class="mi danger" id="discard" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
                Discard changes
              </button>
              <div class="msep"></div>
              <button class="mi" id="exit" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>
                Exit editor
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="toast" id="toast">
        <svg class="tic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span class="tmsg"></span>
      </div>
    `,i.getElementById("publish").addEventListener("click",()=>void this.publish()),i.getElementById("savedraft").addEventListener("click",()=>void this.saveDraftNow()),this.pubCount=i.getElementById("pubcnt");let n=i.getElementById("more"),r=i.getElementById("moremenu"),o=()=>{r.hidden=!0,n.setAttribute("aria-expanded","false")};n.addEventListener("click",d=>{d.stopPropagation(),r.hidden=!r.hidden,n.setAttribute("aria-expanded",r.hidden?"false":"true")}),i.getElementById("versions").addEventListener("click",()=>{o(),this.openVersions()}),i.getElementById("discard").addEventListener("click",()=>{o(),this.discardDraft()}),i.getElementById("exit").addEventListener("click",()=>{o(),this.exit()}),e.addEventListener("click",o),e.addEventListener("keydown",d=>{d.key==="Escape"&&o()}),this.layersBtn=i.getElementById("layers"),this.layersBtn.addEventListener("click",()=>{let d=this.layers.toggle();this.layersBtn.classList.toggle("on",d),this.shiftStageForLayers(d),d&&this.layers.markSelected(this.selectedEl)}),this.peekBtn=i.getElementById("peek"),this.peekBtn.addEventListener("mousedown",()=>this.togglePeek(!0)),this.peekBtn.addEventListener("mouseup",()=>{this.peekSticky||this.togglePeek(!1)}),this.peekBtn.addEventListener("mouseleave",()=>{this.peekSticky||this.togglePeek(!1)}),this.peekBtn.addEventListener("dblclick",()=>{this.peekSticky=!this.peekSticky,this.togglePeek(this.peekSticky)});let a=i.getElementById("devices"),l=i.getElementById("wval");this.markPreset=d=>{for(let h of Array.from(a.querySelectorAll(".dev")))h.classList.toggle("on",h.dataset.preset===d)};for(let d of Array.from(a.querySelectorAll(".dev")))d.addEventListener("click",()=>{let h=Number(d.dataset.pw),g=Number(d.dataset.mw);this.markPreset(d.dataset.preset),l.value=h>0?String(h):"",this.setPreview(h>0?h:1/0,g)});let p=()=>{let d=parseInt(l.value,10);if(!Number.isFinite(d)||d<=0){this.markPreset("desktop"),l.value="",this.setPreview(1/0,0);return}let h=Math.min(3840,Math.max(240,d));l.value=String(h),this.markPreset(this.presetFor(h)),this.setPreview(h,h)};l.addEventListener("change",p),l.addEventListener("keydown",d=>{d.key==="Enter"&&(d.preventDefault(),p(),d.target.blur())});let c=d=>{let h=parseInt(l.value,10)||1280;l.value=String(Math.min(3840,Math.max(240,h+d))),p()};i.getElementById("wdn").addEventListener("click",()=>c(-10)),i.getElementById("wup").addEventListener("click",()=>c(10)),this.status=i.getElementById("status"),this.toastEl=i.getElementById("toast"),e.body.appendChild(t)}topDoc(){try{if(window.frameElement&&window.top&&window.top.document)return window.top.document}catch{}return document}presetFor(e){let t=te.find(i=>i.previewWidth===e);return t?t.id:""}setPreview(e,t){this.deselect(),this.previewW=e,this.activeMax=t,this.applyPreviewWidth(e),this.refreshPreview(),this.setStatus(e===1/0?"Desktop view":`${e}px${t>0?` \xB7 editing \u2264 ${t}px`:""}`)}applyPreviewWidth(e){let t=window.frameElement;if(t){t.style.width=e===1/0?"100%":`${e}px`,t.classList.toggle("framed",e!==1/0);return}let i="weblay-preview-frame",n=document.getElementById(i);if(e===1/0){n?.remove(),document.documentElement.classList.remove("weblay-previewing");return}n||(n=document.createElement("style"),n.id=i,n.setAttribute("data-weblay-ui",""),document.head.appendChild(n)),document.documentElement.classList.add("weblay-previewing"),n.textContent=`
      html.weblay-previewing { background: #0b0d17 !important; }
      html.weblay-previewing body {
        width: ${e}px !important; max-width: ${e}px !important;
        margin-left: auto !important; margin-right: auto !important;
        min-height: 80vh; box-shadow: 0 0 0 1px #272a3a, 0 24px 60px rgba(0,0,0,.6);
        transition: width .28s ease, max-width .28s ease;
      }`}setStatus(e){this.status.textContent=e}toast(e,t=!1){let i=this.toastEl.querySelector(".tmsg")??this.toastEl;i.textContent=e;let n=t==="success"?" success":t?" error":"";this.toastEl.className=`toast show${n}`,clearTimeout(this.toastTimer),this.toastTimer=window.setTimeout(()=>{this.toastEl.className="toast"},t==="success"?4200:3500)}};function T(s){return s.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`)}function Le(s){let e=s instanceof HTMLElement?s:null;return!e||e.closest("[data-weblay-ui]")?null:e}var ae="weblay:view";function le(){return sessionStorage.getItem(ae)}async function Se(s,e){let t=le();if(!t)return!1;let i;try{i=await new x(s,e).revision(t)}catch{return sessionStorage.removeItem(ae),!1}let n=i.manifest?.elements??{};for(let[r,o]of Object.entries(n))R(r,o);return ge(n),ft(i,s,e),!0}function ft(s,e,t){let i=bt(),n=i.createElement("div");n.setAttribute("data-weblay-ui","");let r=n.attachShadow({mode:"open"}),o=new Date(s.publishedAt),a=`${o.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}, ${o.toLocaleTimeString(void 0,{hour:"numeric",minute:"2-digit"})}`;r.innerHTML=`
    <style>
      :host { all: initial; }
      .bar {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
        height: ${52}px; box-sizing: border-box;
        display: flex; align-items: center; gap: 14px; padding: 0 16px;
        background: #1a1206; color: #fde68a; border-top: 1px solid #78350f;
        font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .eye { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; font-weight: 700; color: #fbbf24; }
      .eye svg { width: 16px; height: 16px; }
      .info { flex: 1 1 auto; min-width: 0; color: #fcd34d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .info b { color: #fff7ed; }
      .info .who { color: #d6a441; }
      button {
        font: inherit; border: 0; border-radius: 8px; padding: 8px 16px; cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto;
      }
      button svg { width: 14px; height: 14px; }
      .restore { background: #b45309; color: #fff; font-weight: 600; }
      .restore:hover { background: #d97706; }
      .exit { background: rgba(255,255,255,.08); color: #fde68a; }
      .exit:hover { background: rgba(255,255,255,.16); color: #fff; }
      @media (max-width: 640px) { .info .who { display: none; } button span.t { display: none; } }
    </style>
    <div class="bar">
      <span class="eye">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Read-only
      </span>
      <span class="info">Viewing <b>version ${s.version}</b> \xB7 ${Te(a)} \xB7 <span class="who">by ${Te(s.publishedBy||"unknown")}</span></span>
      <button class="restore" id="restore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg><span class="t">Restore as draft</span></button>
      <button class="exit" id="exit"><span class="t">Back to editor</span></button>
    </div>`;let l=()=>{sessionStorage.removeItem(ae),(window.top??window).location.reload()};r.getElementById("exit").addEventListener("click",l),r.getElementById("restore").addEventListener("click",async()=>{let p=r.getElementById("restore");p.disabled=!0;try{await new x(e,t).restoreDraft(s.id),l()}catch{p.disabled=!1,p.querySelector("span").textContent="Failed \u2014 retry"}}),i.body.appendChild(n)}function bt(){try{if(window.frameElement&&window.top?.document)return window.top.document}catch{}return document}function Te(s){return s.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`)}window.__weblayStartEditor=async(s,e)=>{try{if(le()&&await Se(s,e))return!0;let t=await new x(s,e).session();return await new Y(s,e,t.user.name||t.user.email).start(),!0}catch{return!1}};})();
