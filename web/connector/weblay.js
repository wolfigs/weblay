"use strict";(()=>{var W=new Set(["A","B","STRONG","I","EM","U","S","STRIKE","DEL","INS","CODE","MARK","SUB","SUP","SMALL","SPAN","BR","ABBR","Q"]),H=new Set(["SCRIPT","STYLE","NOSCRIPT","IFRAME","OBJECT","EMBED","TEMPLATE","TEXTAREA","TITLE","HEAD","SVG","MATH"]),N={A:new Set(["href","target","rel","title"]),ABBR:new Set(["title"])},B=new Set(["color","background-color","font-weight","font-style","text-decoration","text-decoration-line","text-transform","font-size"]),j=new Set(["padding","padding-top","padding-right","padding-bottom","padding-left","margin","margin-top","margin-right","margin-bottom","margin-left","width","height","max-width","max-height","min-width","min-height","object-fit","object-position","color","background-color","font-size","font-weight","font-style","line-height","letter-spacing","text-align","text-transform","text-decoration","font-family","border-radius","opacity"]);function p(e){return j.has(e.toLowerCase().trim())}function c(e){return!/url\s*\(|expression\s*\(|javascript\s*:|@import|[<>]/i.test(e)}function D(e){return!/^\s*(javascript|data|vbscript|file)\s*:/i.test(e)}function z(e,t=B){let n=[];for(let o of e.split(";")){let i=o.indexOf(":");if(i<0)continue;let r=o.slice(0,i).toLowerCase().trim(),a=o.slice(i+1).trim();a&&t.has(r)&&c(a)&&n.push(`${r}: ${a}`)}return n.join("; ")}function m(e,t,n){if(!(n>32))for(let o of Array.from(e.childNodes)){if(o.nodeType===Node.TEXT_NODE){t.appendChild(document.createTextNode(o.nodeValue??""));continue}if(o.nodeType!==Node.ELEMENT_NODE)continue;let i=o;if(H.has(i.tagName))continue;if(!W.has(i.tagName)){m(i,t,n+1);continue}let r=document.createElement(i.tagName.toLowerCase()),a=N[i.tagName];if(a)for(let s of a){let f=i.getAttribute(s);f!=null&&(s==="href"&&!D(f)||r.setAttribute(s,f))}i.tagName==="A"&&r.getAttribute("target")==="_blank"&&r.setAttribute("rel","noopener noreferrer");let l=i.getAttribute("style");if(l){let s=z(l);s&&r.setAttribute("style",s)}m(i,r,n+1),t.appendChild(r)}}function v(e){let t=document.createElement("template");t.innerHTML=e;let n=document.createElement("div");return m(t.content,n,0),n.innerHTML}function x(e){if(!/^\d+$/.test(e))return null;let t=parseInt(e,10);return t>0&&t<=1e4?t:null}function U(e){let t=[];for(let n of e){let o=0;try{o=document.querySelectorAll(n).length}catch{continue}t.push({sel:n,state:o===0?"missing":o>1?"duplicate":"found"})}return t}function F(e,t){let n=new Set(e.filter(r=>r.state==="missing").map(r=>r.sel)),o=new Set(e.filter(r=>r.state==="found").map(r=>r.sel));if(n.size===0&&o.size===0||typeof MutationObserver>"u")return;let i=new MutationObserver(()=>{for(let r of Array.from(n)){let a=0;try{a=document.querySelectorAll(r).length}catch{continue}a>=1&&(n.delete(r),t({sel:r,state:"late"}))}for(let r of Array.from(o)){let a=0;try{a=document.querySelectorAll(r).length}catch{continue}a===0&&(o.delete(r),t({sel:r,state:"displaced"}))}});i.observe(document.documentElement,{childList:!0,subtree:!0}),setTimeout(()=>i.disconnect(),4e3)}function E(e,t,n){if(n.filter(a=>a.state!=="found").length===0&&Math.random()>.05)return;let i=JSON.stringify({path:t,results:n}),r=`${e.server}/t/${encodeURIComponent(e.siteKey)}`;try{navigator.sendBeacon?navigator.sendBeacon(r,new Blob([i],{type:"text/plain"})):fetch(r,{method:"POST",body:i,headers:{"Content-Type":"text/plain"},keepalive:!0,mode:"no-cors"})}catch{}}function S(e,t,n){if(n.length===0)return;let o=U(n);E(e,t,o),F(o,i=>E(e,t,[i]))}var K="weblay-media",g="weblay-antifouc",q=6e3,G=5e3;function T(){if(document.getElementById(g))return;let e=document.createElement("style");e.id=g,e.textContent="[data-weblay]{visibility:hidden !important}",(document.head||document.documentElement).appendChild(e),setTimeout(h,q)}function h(){document.getElementById(g)?.remove()}async function A(e){let t=typeof AbortController<"u"?new AbortController:null,n=t?setTimeout(()=>t.abort(),G):void 0;try{let o=`${e.server}/m/${e.siteKey}/manifest.json?path=${encodeURIComponent(e.path)}`,i=await fetch(o,t?{signal:t.signal}:void 0);return i.ok?await i.json():null}catch{return null}finally{clearTimeout(n)}}function L(e,t){for(let[n,o]of Object.entries(e.elements))X(n,o);V(e.elements),t&&S(t,t.path,Object.keys(e.elements))}function V(e){let t=new Set;for(let o of Object.values(e))for(let i of Object.keys(o.media??{})){let r=x(i);r!==null&&t.add(r)}let n="";for(let o of[...t].sort((i,r)=>r-i)){let i="";for(let[r,a]of Object.entries(e)){let l=a.media?.[String(o)];if(!l)continue;let s=Y(l);s&&(i+=`${r}{${s}}`)}i&&(n+=`@media (max-width:${o}px){${i}}`)}J(K,n)}function Y(e){let t=[];for(let[n,o]of Object.entries(e))if(p(n)){if(o===""){t.push(`${n}:unset!important`);continue}c(o)&&t.push(`${n}:${o}!important`)}return t.join(";")}function J(e,t){let n=document.getElementById(e);if(!t){n?.remove();return}n||(n=document.createElement("style"),n.id=e,document.head.appendChild(n)),n.textContent=t}function X(e,t){let n;try{n=document.querySelectorAll(e)}catch{return}if(n.length!==1)return;let o=n[0];if(typeof t.html=="string"?o.innerHTML=v(t.html):typeof t.text=="string"&&(o.textContent=t.text),t.attrs)for(let[i,r]of Object.entries(t.attrs))r===""?o.removeAttribute(i):Z(i,r)&&o.setAttribute(i,r);if(t.style&&o instanceof HTMLElement)for(let[i,r]of Object.entries(t.style))p(i)&&c(r)&&o.style.setProperty(i,r)}var Q=new Set(["src","srcset","alt","title","href","target","rel","aria-label","placeholder"]);function Z(e,t){let n=e.toLowerCase();return!(!Q.has(n)||(n==="href"||n==="src")&&/^\s*(javascript|data|vbscript):/i.test(t))}function C(e){if(!e)return"/";let t=e.split(/[?#]/)[0],n=t.startsWith("/")?t:"/"+t;return n.length>1&&(n=n.replace(/\/+$/,"")||"/"),n}function M(e){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",e,{once:!0}):e()}var b="weblay-loader",y="weblay-loader-skeleton",ee=["none","overlay","bar","skeleton"];function k(e){let t=(o,i="")=>(e?.getAttribute(o)??"").trim()||i,n=t("data-loader","none");return{mode:ee.includes(n)?n:"none",bg:O(t("data-loader-bg","#ffffff"),"#ffffff"),accent:O(t("data-loader-accent","#6366f1"),"#6366f1"),text:t("data-loader-text"),logo:t("data-loader-logo"),customEl:t("data-loader-el")}}function R(e){if(e.customEl||e.mode==="none"||document.getElementById(b)||document.getElementById(y))return;if(e.mode==="skeleton"){let o=document.createElement("style");o.id=y,o.textContent=oe(),(document.head||document.documentElement).appendChild(o);return}let t=document.createElement("div");t.id=b,t.setAttribute("data-weblay-ui","");let n=t.attachShadow({mode:"open"});n.innerHTML=e.mode==="overlay"?te(e):ne(e),(document.body||document.documentElement).appendChild(t)}function I(e){if(e.customEl){let o=document.querySelector(e.customEl);o&&(o.style.transition="opacity .3s ease",o.style.opacity="0",o.style.pointerEvents="none",window.setTimeout(()=>{o.style.display="none"},320));return}document.getElementById(y)?.remove();let t=document.getElementById(b);if(!t)return;let n=t.shadowRoot?.firstElementChild;n&&n.classList.add("weblay-done"),window.setTimeout(()=>t.remove(),340)}function te(e){return`
    <style>
      :host { all: initial; }
      .ov {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
        background: ${e.bg};
        transition: opacity .32s ease; opacity: 1;
        font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .ov.weblay-done { opacity: 0; pointer-events: none; }
      .logo { max-width: 160px; max-height: 64px; object-fit: contain; }
      .spin {
        width: 34px; height: 34px; border-radius: 50%;
        border: 3px solid ${w(e.accent,.22)}; border-top-color: ${e.accent};
        animation: weblay-spin .7s linear infinite;
      }
      .txt { color: ${w(e.accent,.9)}; font-weight: 500; letter-spacing: .01em; }
      @keyframes weblay-spin { to { transform: rotate(360deg); } }
    </style>
    <div class="ov">
      ${e.logo?`<img class="logo" src="${ie(e.logo)}" alt="" />`:""}
      <div class="spin"></div>
      ${e.text?`<div class="txt">${re(e.text)}</div>`:""}
    </div>`}function ne(e){return`
    <style>
      :host { all: initial; }
      .bar {
        position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 2147483647;
        background: ${w(e.accent,.15)}; overflow: hidden;
        transition: opacity .3s ease; opacity: 1;
      }
      .bar.weblay-done { opacity: 0; }
      .bar::before {
        content: ""; position: absolute; inset: 0 auto 0 0; width: 40%;
        background: ${e.accent};
        animation: weblay-slide 1.1s cubic-bezier(.4,0,.2,1) infinite;
      }
      @keyframes weblay-slide {
        0%   { left: -40%; width: 40%; }
        50%  { left: 30%;  width: 55%; }
        100% { left: 100%; width: 40%; }
      }
    </style>
    <div class="bar"></div>`}function oe(){return`
    [data-weblay], [data-weblay-skeleton] {
      visibility: visible !important;
      color: transparent !important;
      background-color: rgba(0,0,0,.08) !important;
      background-image: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.6) 50%, transparent 80%) !important;
      background-repeat: no-repeat !important;
      background-size: 200% 100% !important;
      border-radius: 6px !important;
      animation: weblay-shimmer 1.15s ease-in-out infinite !important;
    }
    [data-weblay] *, [data-weblay-skeleton] * { visibility: hidden !important; }
    @keyframes weblay-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}function O(e,t){return/^#[0-9a-fA-F]{3,8}$|^rgb|^hsl|^[a-zA-Z]+$/.test(e)&&!/[<>(){};]/.test(e.replace(/^rgb\(|^hsl\(|\)$/g,""))?e:t}function w(e,t){let n=e.match(/^#([0-9a-fA-F]{6})$/);if(!n)return e;let o=parseInt(n[1],16);return`rgba(${o>>16&255}, ${o>>8&255}, ${o&255}, ${t})`}function ie(e){return e.replace(/["'<>]/g,t=>`&#${t.charCodeAt(0)};`)}function re(e){return e.replace(/[<>&]/g,t=>`&#${t.charCodeAt(0)};`)}var $="weblay-stage";function _(){return window.name===$}function P(){document.documentElement.style.overflow="hidden";let e=document.createElement("div");e.setAttribute("data-weblay-ui","");let t=e.attachShadow({mode:"open"});t.innerHTML=`
    <style>
      :host { all: initial; }
      .backdrop {
        position: fixed; inset: 0; z-index: 2147483000;
        background: #0b0d17;
        display: flex; flex-direction: column; align-items: center;
        transition: padding-left .22s ease;
      }
      .stage {
        border: 0; width: 100%; max-width: 100%; flex: 1 1 auto; min-height: 0;
        background: #fff; display: block;
        transition: width .28s cubic-bezier(.4,0,.2,1), max-width .28s cubic-bezier(.4,0,.2,1);
      }
      /* A device chrome shadow appears once the stage is narrower than full. */
      .stage.framed { box-shadow: 0 0 0 1px #272a3a, 0 30px 80px rgba(0,0,0,.6); }
      /* Reserved strip the top-window editor bar sits over \u2014 no content overlap. */
      .bar-space { flex: 0 0 52px; width: 100%; }
    </style>
    <div class="backdrop">
      <iframe class="stage" name="${$}" title="Weblay editing stage"
              allow="clipboard-write"></iframe>
      <div class="bar-space"></div>
    </div>`;let n=t.querySelector("iframe");n.src=location.href,document.body.appendChild(e)}var u="weblay:token",ae="/weblay-editor.js";(()=>{let e=document.currentScript,t=e?.getAttribute("data-site")??"";if(!t){console.warn("[weblay] missing data-site attribute on script tag");return}let n=e?.getAttribute("data-server")?.replace(/\/$/,"")||new URL(e.src).origin,o={siteKey:t,server:n,path:C(location.pathname)},i=k(e);T(),R(i);let r=A(o),a=()=>{h(),I(i)};M(async()=>{let l=se();if(l&&!_()){a(),P();return}let s=await r;s&&L(s,o),a(),l&&await le(o,l)})})();function se(){let e=location.hash.match(/[#&]weblay=([a-f0-9]+)/),t=location.hash.match(/[#&]rebind=([^&]+)/);return e&&(sessionStorage.setItem(u,e[1]),t&&sessionStorage.setItem("weblay:rebind",decodeURIComponent(t[1])),history.replaceState(null,"",location.pathname+location.search)),sessionStorage.getItem(u)}async function le(e,t){try{await ce(e.server),await window.__weblayStartEditor?.(e,t)||sessionStorage.removeItem(u)}catch{sessionStorage.removeItem(u)}}var d=null;function ce(e){return window.__weblayStartEditor?Promise.resolve():d||(d=new Promise((t,n)=>{let o=document.createElement("script");o.src=e+ae,o.async=!0,o.onload=()=>t(),o.onerror=()=>n(new Error("failed to load editor")),document.head.appendChild(o)}),d)}})();
