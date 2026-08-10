"use strict";(()=>{var m=class{constructor(t,e){this.cfg=t;this.token=e}async call(t,e,i){let s=await fetch(`${this.cfg.server}${e}`,{method:t,headers:{Authorization:`Bearer ${this.token}`,...i?{"Content-Type":"application/json"}:{}},body:i?JSON.stringify(i):void 0});if(!s.ok){let o=await s.json().catch(()=>({error:s.statusText}));throw new Error(o.error||`HTTP ${s.status}`)}return await s.json()}session(){return this.call("GET","/api/v1/edit/session")}drafts(){return this.call("GET",`/api/v1/edit/content?path=${encodeURIComponent(this.cfg.path)}`)}saveDraft(t,e){return this.call("PUT","/api/v1/edit/content",{path:this.cfg.path,selector:t,content:e})}removeOverride(t){return this.call("DELETE",`/api/v1/edit/content?path=${encodeURIComponent(this.cfg.path)}&selector=${encodeURIComponent(t)}`)}publish(){return this.call("POST","/api/v1/edit/publish",{path:this.cfg.path})}async upload(t){let e=new FormData;e.append("file",t);let i=await fetch(`${this.cfg.server}/api/v1/edit/upload`,{method:"POST",headers:{Authorization:`Bearer ${this.token}`},body:e});if(!i.ok){let s=await i.json().catch(()=>({error:i.statusText}));throw new Error(s.error||`HTTP ${i.status}`)}return await i.json()}};function g(n){let t=n.getAttribute("data-inlay");if(t)return`[data-inlay="${C(t)}"]`;let e=[],i=n;for(;i&&i!==document.body&&i!==document.documentElement;){let s=i.parentElement;if(i.id&&N(i.id))return e.unshift(`#${C(i.id)}`),e.join(" > ");let o=i.tagName.toLowerCase(),c=1;if(s)for(let a of Array.from(s.children)){if(a===i)break;a.tagName===i.tagName&&c++}e.unshift(`${o}:nth-of-type(${c})`),i=s}return e.unshift("body"),e.join(" > ")}function N(n){return/^[A-Za-z][\w-]*$/.test(n)}function C(n){return typeof CSS<"u"&&CSS.escape?CSS.escape(n):n.replace(/[^\w-]/g,"\\$&")}var T="inlay-antifouc";function k(){if(document.getElementById(T))return;let n=document.createElement("style");n.id=T,n.textContent="[data-inlay]{visibility:hidden !important}",document.head.appendChild(n),setTimeout(S,400)}function S(){document.getElementById(T)?.remove()}async function M(n){try{let t=`${n.server}/m/${n.siteKey}/manifest.json?path=${encodeURIComponent(n.path)}`,e=await fetch(t);return e.ok?await e.json():null}catch{return null}}function I(n){for(let[t,e]of Object.entries(n.elements))L(t,e)}function L(n,t){let e=null;try{e=document.querySelector(n)}catch{return}if(e){if(typeof t.text=="string"&&(e.textContent=t.text),t.attrs)for(let[i,s]of Object.entries(t.attrs))s===""?e.removeAttribute(i):D(i,s)&&e.setAttribute(i,s);if(t.style&&e instanceof HTMLElement)for(let[i,s]of Object.entries(t.style))U(i)&&O(s)&&e.style.setProperty(i,s)}}var z=new Set(["src","srcset","alt","title","href","target","rel","aria-label","placeholder"]);function D(n,t){let e=n.toLowerCase();return!(!z.has(e)||(e==="href"||e==="src")&&/^\s*javascript:/i.test(t))}var R=new Set(["padding","padding-top","padding-right","padding-bottom","padding-left","margin","margin-top","margin-right","margin-bottom","margin-left","width","height","max-width","max-height","min-width","min-height","object-fit","object-position"]);function U(n){return R.has(n.toLowerCase())}function O(n){return!/url\s*\(|expression\s*\(|javascript\s*:|<|>/i.test(n)}function P(n){if(!n)return"/";let t=n.split(/[?#]/)[0],e=t.startsWith("/")?t:"/"+t;return e.length>1&&(e=e.replace(/\/+$/,"")||"/"),e}function H(n){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",n,{once:!0}):n()}var F={A:[{key:"href",label:"Link URL",inputType:"url"},{key:"title",label:"Tooltip"},{key:"target",label:"Target (_blank / _self)"},{key:"aria-label",label:"ARIA label"}],IMG:[{key:"alt",label:"Alt text"},{key:"title",label:"Tooltip"}],INPUT:[{key:"placeholder",label:"Placeholder"},{key:"aria-label",label:"ARIA label"},{key:"title",label:"Tooltip"}],BUTTON:[{key:"aria-label",label:"ARIA label"},{key:"title",label:"Tooltip"}],TEXTAREA:[{key:"placeholder",label:"Placeholder"},{key:"aria-label",label:"ARIA label"}]},j=[{key:"title",label:"Tooltip"},{key:"aria-label",label:"ARIA label"}];var b=class{constructor(){this.activeEl=null;this.syncPos=()=>{if(!this.activeEl||this.panel.style.display==="none")return;let t=this.activeEl.getBoundingClientRect(),e=this.panel.offsetHeight||280,i=296,s=t.top-e-10;s<8&&(s=t.bottom+10),s+e>window.innerHeight-70&&(s=Math.max(8,window.innerHeight-e-74));let o=t.left;o+i>window.innerWidth-8&&(o=window.innerWidth-i-8),o<8&&(o=8),this.panel.style.top=`${s}px`,this.panel.style.left=`${o}px`};this.host=document.createElement("div"),this.host.setAttribute("data-inlay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),this.buildShell(),document.body.appendChild(this.host),window.addEventListener("scroll",this.syncPos,{passive:!0}),window.addEventListener("resize",this.syncPos,{passive:!0})}destroy(){window.removeEventListener("scroll",this.syncPos),window.removeEventListener("resize",this.syncPos),this.host.remove()}show(t,e,i,s=!1){this.activeEl=t,this.renderAttrs(t,e,i,s),this.renderSpacing(t,e,i.onStyle),this.panel.style.display="block",this.syncPos()}hide(){this.panel.style.display="none",this.activeEl=null}buildShell(){this.shadow.innerHTML=`
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
        .tabs { display: flex; border-bottom: 1px solid #1a1d2e; }
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
        .replace-btn {
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #9ca3af; padding: 7px 12px; cursor: pointer; text-align: left;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          margin-top: 2px; width: 100%; box-sizing: border-box;
        }
        .replace-btn:hover { background: #1f2333; color: #d1d5db; }
        .spacing-section {
          font-size: 10px; color: #6b7280; font-weight: 700;
          text-transform: uppercase; letter-spacing: .08em;
          padding-bottom: 6px; border-bottom: 1px solid #1a1d2e;
        }
        .bm {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px;
          align-items: center;
          justify-items: center;
        }
        .bm-input {
          width: 72px; padding: 5px 4px; text-align: center;
          background: #161824; border: 1px solid #272a3a; border-radius: 6px;
          color: #e5e7eb; outline: none; box-sizing: border-box;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .bm-input:focus { border-color: #6366f1; }
        .bm-label {
          font-size: 9px; color: #374151; font-weight: 600;
          text-transform: uppercase; letter-spacing: .06em;
        }
      </style>
      <div class="panel" id="panel">
        <div class="tabs">
          <button class="tab on" id="tab-a">Attributes</button>
          <button class="tab" id="tab-s">Spacing</button>
        </div>
        <div class="body" id="ab"></div>
        <div class="body off" id="sb"></div>
      </div>
    `,this.panel=this.shadow.getElementById("panel"),this.attrsBody=this.shadow.getElementById("ab"),this.spacingBody=this.shadow.getElementById("sb");let t=this.shadow.getElementById("tab-a"),e=this.shadow.getElementById("tab-s");t.addEventListener("click",()=>{t.className="tab on",e.className="tab",this.attrsBody.className="body",this.spacingBody.className="body off"}),e.addEventListener("click",()=>{e.className="tab on",t.className="tab",this.spacingBody.className="body",this.attrsBody.className="body off"})}renderAttrs(t,e,i,s){let o=F[t.tagName]??j,c=e.attrs??{};this.attrsBody.innerHTML="";for(let a of o){let d=c[a.key]??t.getAttribute(a.key)??"",h=document.createElement("div");h.className="field";let l=document.createElement("span");l.className="field-label",l.textContent=a.label;let r=document.createElement("input");r.className="field-input",r.type=a.inputType??"text",r.value=d,r.placeholder=a.key,r.addEventListener("change",()=>{let v=r.value.trim();i.onAttr(a.key,v),a.key==="target"&&v==="_blank"&&i.onAttr("rel","noopener noreferrer")}),h.append(l,r),this.attrsBody.appendChild(h)}if(s){let a=document.createElement("button");a.className="replace-btn",a.textContent="Replace image\u2026",a.addEventListener("click",()=>{let d=document.createElement("input");d.type="file",d.accept="image/*",d.onchange=()=>{d.files?.[0]&&i.onUpload(d.files[0])},d.click()}),this.attrsBody.appendChild(a)}}renderSpacing(t,e,i){let s=window.getComputedStyle(t),o=e.style??{};this.spacingBody.innerHTML="";for(let c of["padding","margin"]){let a=document.createElement("div");a.className="spacing-section",a.textContent=c==="padding"?"Padding":"Margin",this.spacingBody.appendChild(a);let d=document.createElement("div");d.className="bm";let h=[{side:"top",col:2,row:1},{side:"left",col:1,row:2},{side:"right",col:3,row:2},{side:"bottom",col:2,row:3}],l=document.createElement("div");l.className="bm-label",l.style.cssText="grid-column:2;grid-row:2;",l.textContent=c==="padding"?"P":"M",d.appendChild(l);for(let{side:r,col:v,row:$}of h){let f=`${c}-${r}`,B=o[f]??s.getPropertyValue(f)??"0px",w=document.createElement("div");w.style.cssText=`grid-column:${v};grid-row:${$};`;let p=document.createElement("input");p.className="bm-input",p.type="text",p.value=B,p.title=f,p.addEventListener("input",()=>{let u=p.value.trim(),y=/^\d+(\.\d+)?$/.test(u)?u+"px":u;t instanceof HTMLElement&&t.style.setProperty(f,y)}),p.addEventListener("change",()=>{let u=p.value.trim(),y=/^\d+(\.\d+)?$/.test(u)?u+"px":u;p.value=y,i(f,y)}),w.appendChild(p),d.appendChild(w)}this.spacingBody.appendChild(d)}}};var _=["nw","n","ne","e","se","s","sw","w"],x=class{constructor(t){this.img=null;this.dragging=null;this.ratio=1;this.sync=()=>{if(!this.img||this.overlay.style.display==="none")return;let t=this.img.getBoundingClientRect();this.overlay.style.top=`${t.top}px`,this.overlay.style.left=`${t.left}px`,this.overlay.style.width=`${t.width}px`,this.overlay.style.height=`${t.height}px`,this.badge.textContent=`${Math.round(t.width)} \xD7 ${Math.round(t.height)}`};this.onMove=t=>{if(!this.dragging||!this.img)return;let{pos:e,startX:i,startY:s,startW:o,startH:c}=this.dragging,a=t.clientX-i,d=t.clientY-s,h=t.shiftKey,l=o,r=c;e.includes("e")&&(l=Math.max(20,o+a)),e.includes("w")&&(l=Math.max(20,o-a)),e.includes("s")&&(r=Math.max(20,c+d)),e.includes("n")&&(r=Math.max(20,c-d)),h&&(e.length===2?r=l/this.ratio:e==="n"||e==="s"?l=r*this.ratio:r=l/this.ratio),l=Math.round(l),r=Math.round(r),this.img.style.width=`${l}px`,this.img.style.height=`${r}px`,this.sync()};this.onUp=()=>{if(!this.dragging||!this.img)return;let t=this.img.getBoundingClientRect();this.dragging=null,this.onDone({widthPx:Math.round(t.width),heightPx:Math.round(t.height)})};this.onDone=t,this.host=document.createElement("div"),this.host.setAttribute("data-inlay-ui",""),this.shadow=this.host.attachShadow({mode:"open"}),this.buildOverlay(),document.body.appendChild(this.host),window.addEventListener("scroll",this.sync,{passive:!0}),window.addEventListener("resize",this.sync,{passive:!0}),document.addEventListener("mousemove",this.onMove),document.addEventListener("mouseup",this.onUp)}destroy(){window.removeEventListener("scroll",this.sync),window.removeEventListener("resize",this.sync),document.removeEventListener("mousemove",this.onMove),document.removeEventListener("mouseup",this.onUp),this.host.remove()}attach(t){this.img=t,this.ratio=t.naturalWidth>0&&t.naturalHeight>0?t.naturalWidth/t.naturalHeight:1,this.overlay.style.display="block",this.sync()}detach(){this.overlay.style.display="none",this.img=null,this.dragging=null}buildOverlay(){this.shadow.innerHTML=`
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
        ${_.map(t=>`<div class="h" data-p="${t}"></div>`).join("")}
        <div class="badge" id="badge"></div>
      </div>
    `,this.overlay=this.shadow.getElementById("ov"),this.badge=this.shadow.getElementById("badge");for(let t of Array.from(this.shadow.querySelectorAll(".h")))t.addEventListener("mousedown",e=>{if(e.preventDefault(),e.stopPropagation(),!this.img)return;let i=this.img.getBoundingClientRect();this.dragging={pos:t.dataset.p??"se",startX:e.clientX,startY:e.clientY,startW:i.width,startH:i.height}})}};var G=new Set(["P","H1","H2","H3","H4","H5","H6","SPAN","A","LI","BLOCKQUOTE","BUTTON","FIGCAPTION","TD","TH","DT","DD","LABEL","SMALL","STRONG","EM"]),E=class{constructor(t,e,i){this.editorName=i;this.dirty=new Map;this.committed=new Map;this.saving=!1;this.selectedEl=null;this.textActive=null;this.originalText="";this.onTextClick=t=>{let e=t.currentTarget;if(t.preventDefault(),t.stopPropagation(),this.selectedEl===e&&this.textActive===e)return;this.deselect(),this.selectedEl=e,this.textActive=e,this.originalText=e.textContent??"",e.setAttribute("contenteditable","plaintext-only"),e.classList.add("inlay-editing"),e.focus(),e.addEventListener("blur",this.onTextBlur,{once:!0}),e.addEventListener("keydown",this.onTextKeydown);let i=g(e);this.panel.show(e,this.dirty.get(i)??{},{onAttr:(s,o)=>this.handleAttrChange(i,e,s,o),onStyle:(s,o)=>this.handleStyleChange(i,e,s,o),onUpload:()=>{}})};this.onTextKeydown=t=>{t.key==="Escape"?(t.preventDefault(),this.textActive&&(this.textActive.textContent=this.originalText),this.textActive?.blur()):t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),this.textActive?.blur())};this.onTextBlur=t=>{let e=t.currentTarget;e.removeAttribute("contenteditable"),e.classList.remove("inlay-editing"),e.removeEventListener("keydown",this.onTextKeydown);let i=e.textContent??"";if(i!==this.originalText){let s=g(e);this.patchDirty(s,{text:i}),this.scheduleSave()}this.textActive=null};this.onImageClick=t=>{let e=t.currentTarget;if(t.preventDefault(),t.stopPropagation(),this.selectedEl===e)return;this.deselect(),this.selectedEl=e,e.classList.add("inlay-selected"),this.handles.attach(e);let i=g(e);this.panel.show(e,this.dirty.get(i)??{},{onAttr:(s,o)=>this.handleAttrChange(i,e,s,o),onStyle:(s,o)=>this.handleStyleChange(i,e,s,o),onUpload:s=>void this.uploadAndReplace(e,i,s)},!0)};this.onDocClick=t=>{let e=t.target instanceof HTMLElement?t.target:null;e&&(e.closest("[data-inlay-ui]")||e.classList.contains("inlay-editable")||this.deselect())};this.api=new m(t,e)}async start(){let t=await this.api.drafts();for(let[e,i]of Object.entries(t.elements))this.committed.set(e,i),L(e,i);this.panel=new b,this.handles=new x(e=>{if(!this.selectedEl)return;let i=g(this.selectedEl);this.patchDirty(i,{style:{width:`${e.widthPx}px`,height:`${e.heightPx}px`}}),this.scheduleSave()}),this.injectStyles(),this.buildBar(),this.markEditable(),this.setStatus("No unsaved changes"),document.addEventListener("click",this.onDocClick,!0)}markEditable(){for(let t of Array.from(document.body.querySelectorAll("*")))if(!t.closest("[data-inlay-ui]")){if(t.tagName==="IMG"){t.classList.add("inlay-editable","inlay-img"),t.addEventListener("click",this.onImageClick);continue}G.has(t.tagName)&&this.isTextLeaf(t)&&(t.classList.add("inlay-editable"),t.addEventListener("click",this.onTextClick))}}isTextLeaf(t){return t.children.length===0&&(t.textContent??"").trim().length>0}async uploadAndReplace(t,e,i){this.setStatus("Uploading image\u2026");try{let{url:s}=await this.api.upload(i);t.src=s,t.removeAttribute("srcset"),this.handleAttrChange(e,t,"src",s),this.handleAttrChange(e,t,"srcset","")}catch(s){this.toast(`Upload failed: ${s.message}`,!0),this.setStatus("Upload failed")}}handleAttrChange(t,e,i,s){s===""?e.removeAttribute(i):e.setAttribute(i,s),this.patchDirty(t,{attrs:{[i]:s}}),this.scheduleSave()}handleStyleChange(t,e,i,s){e.style.setProperty(i,s),this.patchDirty(t,{style:{[i]:s}}),this.scheduleSave()}patchDirty(t,e){let i=this.dirty.get(t)??this.committed.get(t)??{};this.dirty.set(t,{...i,...e.text!==void 0?{text:e.text}:{},...e.html!==void 0?{html:e.html}:{},attrs:e.attrs?{...i.attrs??{},...e.attrs}:i.attrs,style:e.style?{...i.style??{},...e.style}:i.style})}deselect(){this.textActive&&this.textActive.blur(),this.selectedEl&&(this.selectedEl.classList.remove("inlay-selected"),this.selectedEl=null),this.handles.detach(),this.panel.hide()}scheduleSave(){this.setStatus(`${this.dirty.size} unsaved change${this.dirty.size===1?"":"s"}\u2026`),clearTimeout(this.saveTimer),this.saveTimer=window.setTimeout(()=>void this.flush(),600)}async flush(){if(this.saving||this.dirty.size===0)return;this.saving=!0;let t=new Map(this.dirty);this.dirty.clear();try{for(let[e,i]of t)await this.api.saveDraft(e,i),this.committed.set(e,i);this.dirty.size===0&&this.setStatus("Draft saved")}catch(e){for(let[i,s]of t)this.dirty.has(i)||this.dirty.set(i,s);this.toast(`Save failed: ${e.message}`,!0),this.setStatus("Save failed \u2014 changes kept locally")}finally{this.saving=!1}}async publish(){if(this.textActive&&this.textActive.blur(),await this.flush(),this.dirty.size>0){this.toast("Fix the failed save before publishing",!0);return}this.setStatus("Publishing\u2026");try{let{version:t}=await this.api.publish();this.setStatus("No unsaved changes"),this.toast(`Published \u2014 version ${t} is live`)}catch(t){this.toast(`Publish failed: ${t.message}`,!0),this.setStatus("Publish failed")}}exit(){sessionStorage.removeItem("inlay:token"),location.reload()}injectStyles(){let t=document.createElement("style");t.setAttribute("data-inlay-ui",""),t.textContent=`
      .inlay-editable {
        outline: 1.5px dashed rgba(99,102,241,0);
        outline-offset: 2px; transition: outline-color .15s; cursor: pointer;
      }
      .inlay-editable:hover { outline-color: rgba(99,102,241,.8); }
      .inlay-editing { outline: 2px solid rgb(99,102,241) !important; cursor: text; }
      .inlay-selected { outline: 2px solid #6366f1 !important; outline-offset: 2px; }
      .inlay-img:hover { filter: brightness(.85); }
      body { margin-bottom: 64px !important; }
    `,document.head.appendChild(t)}buildBar(){let t=document.createElement("div");t.setAttribute("data-inlay-ui","");let e=t.attachShadow({mode:"open"});e.innerHTML=`
      <style>
        :host { all: initial; }
        .bar {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
          display: flex; align-items: center; gap: 16px; padding: 10px 20px;
          background: #0b0d17; color: #e5e7eb; border-top: 1px solid #272a3a;
          font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .brand { font-weight: 700; letter-spacing: .04em; color: #a5b4fc; }
        .who { color: #9ca3af; }
        .status { flex: 1; text-align: right; color: #9ca3af; }
        button { font: inherit; border: 0; border-radius: 8px; padding: 8px 18px; cursor: pointer; }
        .publish { background: #6366f1; color: #fff; font-weight: 600; }
        .publish:hover { background: #818cf8; }
        .exit { background: #1f2333; color: #d1d5db; }
        .exit:hover { background: #2a2f45; }
        .toast {
          position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
          background: #16a34a; color: #fff; padding: 10px 22px; border-radius: 10px;
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          opacity: 0; transition: opacity .25s; pointer-events: none; max-width: 80vw;
        }
        .toast.error { background: #dc2626; }
        .toast.show { opacity: 1; }
      </style>
      <div class="bar">
        <span class="brand">INLAY</span>
        <span class="who">Editing as ${K(this.editorName)} \u2014 click any text or image</span>
        <span class="status" id="status"></span>
        <button class="publish" id="publish">Publish</button>
        <button class="exit" id="exit">Exit</button>
      </div>
      <div class="toast" id="toast"></div>
    `,e.getElementById("publish").addEventListener("click",()=>void this.publish()),e.getElementById("exit").addEventListener("click",()=>this.exit()),this.status=e.getElementById("status"),this.toastEl=e.getElementById("toast"),document.body.appendChild(t)}setStatus(t){this.status.textContent=t}toast(t,e=!1){this.toastEl.textContent=t,this.toastEl.className=`toast show${e?" error":""}`,clearTimeout(this.toastTimer),this.toastTimer=window.setTimeout(()=>{this.toastEl.className="toast"},3500)}};function K(n){return n.replace(/[&<>"']/g,t=>`&#${t.charCodeAt(0)};`)}var A="inlay:token";(()=>{let n=document.currentScript,t=n?.getAttribute("data-site")??"";if(!t){console.warn("[inlay] missing data-site attribute on script tag");return}let e=n?.getAttribute("data-server")?.replace(/\/$/,"")||new URL(n.src).origin,i={siteKey:t,server:e,path:P(location.pathname)};k();let s=M(i);H(async()=>{let o=await s;o&&I(o),S(),await W(i)})})();async function W(n){let t=location.hash.match(/[#&]inlay=([a-f0-9]+)/);t&&(sessionStorage.setItem(A,t[1]),history.replaceState(null,"",location.pathname+location.search));let e=sessionStorage.getItem(A);if(e)try{let i=await new m(n,e).session();await new E(n,e,i.user.name||i.user.email).start()}catch{sessionStorage.removeItem(A)}}})();
