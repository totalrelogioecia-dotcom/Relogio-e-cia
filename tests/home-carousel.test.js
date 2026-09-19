'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relogio-carousel-test-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_SESSION_SECRET = 'test-carousel-session-secret-not-production';
const { registerHomeCarouselRoutes, normalizeCarousel, publicCarousel, readCarousel, FILE } = require('../home-carousel');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';
const input = (slides = []) => ({ revision: 0, autoplay:true, interval:7, slides });
const slide = (id='one', enabled=true) => ({ id, enabled, image:png, mobile_image:'', dark_image:'', dark_mobile_image:'', alt:'Relógio em fundo claro', href:'produtos.html?marca=Casio' });
const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test.after(() => fs.rmSync(dataDir, { recursive:true, force:true }));

test('carrossel começa sem fotos e aceita até cinco espaços vazios', () => {
  assert.equal(publicCarousel(readCarousel()).slides.length, 0);
  assert.equal(readCarousel().slides.length, 3);
  assert.equal(normalizeCarousel(input([{ id:'empty', enabled:true }])).slides[0].image, '');
  assert.throws(() => normalizeCarousel(input(Array.from({length:6},(_,n)=>slide('s'+n)))), /5 slides/);
  assert.throws(() => normalizeCarousel(input([slide(),slide()])), /repetida/);
  assert.throws(() => normalizeCarousel(input([{enabled:true}])), /Identificação/);
});
test('fotos, descrições e destinos são validados sem aceitar SVG ou links externos', () => {
  assert.equal(normalizeCarousel(input([slide()])).slides[0].image, png);
  assert.throws(() => normalizeCarousel(input([{...slide(),alt:''}])), /Descreva/);
  assert.throws(() => normalizeCarousel(input([{...slide(),image:'data:image/svg+xml;base64,PHN2Zz4='}])), /JPG/);
  assert.throws(() => normalizeCarousel(input([{...slide(),image:'data:image/png;base64,YmFk'}])), /corresponde/);
  assert.throws(() => normalizeCarousel(input([{...slide(),href:'javascript:alert(1)'}])), /destino/);
  assert.throws(() => normalizeCarousel(input([{...slide(),href:'https://example.com/'}])), /destino/);
  assert.throws(() => normalizeCarousel(input([{...slide(),href:'/api/admin/users'}])), /destino/);
  assert.throws(() => normalizeCarousel(input([{...slide(),image:'',mobile_image:png}])), /principal/);
  assert.throws(() => normalizeCarousel(input([{...slide(),image:'',dark_image:png}])), /principal/);
});
test('resposta pública preserva ordem e omite fotos inativas e dados brutos', () => {
  const data = publicCarousel({...normalizeCarousel(input([{...slide('second'),dark_image:png,dark_mobile_image:png},slide('off',false),slide('first')])),revision:4});
  assert.deepEqual(data.slides.map(s=>s.id), ['second','first']);
  assert.equal(data.slides[0].image, '/api/home-carousel/images/second/desktop?v=4');
  assert.equal(data.slides[0].dark_image, '/api/home-carousel/images/second/dark-desktop?v=4');
  assert.equal(data.slides[0].dark_mobile_image, '/api/home-carousel/images/second/dark-mobile?v=4');
  assert.doesNotMatch(JSON.stringify(data), /data:image|updated_at/);
});
test('scripts e estilos do carrossel são válidos e apenas clientes são públicos', () => {
  const { isPublicStaticPath } = require('../public-static-policy');
  for (const name of ['admin-home-carousel.js','home-carousel-client.js']) { new vm.Script(read(name)); assert.equal(isPublicStaticPath('/'+name),true); }
  assert.equal(isPublicStaticPath('/home-carousel.js'),false);
  assert.equal(isPublicStaticPath('/data/home-carousel.json'),false);
  assert.match(read('persistent-store.js'), /home-carousel\.json.*home_carousel/);
  assert.match(read('admin-security-bootstrap.js'), /home-carousel.*return false/);
  assert.match(read('home-carousel-client.js'), /prefers-reduced-motion/);
  assert.match(read('home-carousel-client.js'), /focusin.*pause/);
  assert.match(read('home-carousel-client.js'), /pointercancel/);
  assert.match(read('home-carousel.css'), /height:260px/);
});
test('API exige proprietário, persiste mudanças, protege concorrência e respeita revogação', async () => {
  const users = ['owner','manager','atendimento'].map(access_level => ({ id:access_level, access_level, active:true, session_version:1, email:access_level+'@example.com' }));
  const usersFile = path.join(dataDir,'admin-users.json');
  fs.writeFileSync(usersFile,JSON.stringify(users));
  function cookie(role) {
    const body = Buffer.from(JSON.stringify({ role:'admin',user_id:role,session_version:1,exp:Date.now()+60000 })).toString('base64url');
    const signature = crypto.createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(body).digest('base64url');
    return `reloja_admin_session=${body}.${signature}`;
  }
  const express = require('express'); const app = express(); app.use(express.json({ limit:'10mb' })); registerHomeCarouselRoutes(app);
  const server = await new Promise(resolve => { const s = app.listen(0,'127.0.0.1',()=>resolve(s)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url,role='',method='GET',body) => fetch(origin+url,{ method,headers:{ 'Content-Type':'application/json',Cookie:role ? cookie(role) : '' },body:body === undefined ? undefined : JSON.stringify(body) });
  try {
    assert.equal((await request('/api/admin/home-carousel')).status,401);
    for (const role of ['manager','atendimento']) for (const method of ['GET','PUT']) assert.equal((await request('/api/admin/home-carousel',role,method,method==='PUT'?input():undefined)).status,403);
    const initial = await (await request('/api/admin/home-carousel','owner')).json();
    assert.equal(initial.revision,0);
    const savedResponse = await request('/api/admin/home-carousel','owner','PUT',input([{...slide('one'),dark_image:png,dark_mobile_image:png},slide('disabled',false)]));
    assert.equal(savedResponse.status,200);
    const saved = await savedResponse.json(); assert.equal(saved.revision,1);
    assert.equal(JSON.parse(fs.readFileSync(FILE,'utf8')).slides[0].image,png);
    assert.equal((await request('/api/admin/home-carousel','owner','PUT',input())).status,409);
    const publicData = await (await request('/api/home-carousel')).json(); assert.equal(publicData.slides.length,1);
    const photo = await request(publicData.slides[0].image); assert.equal(photo.status,200); assert.equal(photo.headers.get('content-type'),'image/png'); assert.equal(photo.headers.get('x-content-type-options'),'nosniff');
    assert.equal((await request(publicData.slides[0].dark_image)).status,200);
    assert.equal((await request(publicData.slides[0].dark_mobile_image)).status,200);
    assert.equal((await request('/api/home-carousel/images/disabled/desktop')).status,404);
    assert.equal((await request('/api/home-carousel/images/one/mobile')).status,404);
    const concurrent = await Promise.all([request('/api/admin/home-carousel','owner','PUT',{...saved,interval:8}),request('/api/admin/home-carousel','owner','PUT',{...saved,interval:9})]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    users[0].session_version = 2; fs.writeFileSync(usersFile,JSON.stringify(users));
    assert.equal((await request('/api/admin/home-carousel','owner')).status,401);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

function clientHarness(data, reduce = false) {
  class Node {
    constructor(tag='div') { this.tagName=tag; this.children=[]; this.dataset={}; this.attrs={}; this.events={}; this.hidden=false; this.textContent=''; this.captured=null; this.classes=new Set(); this.style={}; this.clientWidth=1000; this.parentNode=null; this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name)}; }
    append(...nodes) { nodes.forEach(node=>node.parentNode=this); this.children.push(...nodes); }
    contains(node) { return this===node || this.children.some(child=>child.contains?.(node)); }
    replaceChildren(...nodes) { this.children.forEach(node=>node.parentNode=null); nodes.forEach(node=>node.parentNode=this); this.children=nodes; }
    remove() { if (!this.parentNode) return; this.parentNode.children=this.parentNode.children.filter(node=>node!==this); this.parentNode=null; }
    setAttribute(key,value) { this.attrs[key]=value; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(event,callback) { (this.events[event] ||= []).push(callback); }
    emit(event,value={}) { for (const fn of this.events[event] || []) fn(value); }
    setPointerCapture(id) { this.captured=id; }
    hasPointerCapture(id) { return this.captured===id; }
    releasePointerCapture(id) { if (this.captured===id) this.captured=null; }
    querySelectorAll(selector) { return this.children.flatMap(n=>[n,...n.querySelectorAll(selector)]).filter(n=>selector==='[data-slide]' ? n.dataset.slide !== undefined : selector==='[data-play]' ? n.dataset.play !== undefined : false); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const root=new Node(),stage=new Node(),controls=new Node(),documentElement=new Node('html'); root.append(stage,controls);
  const document={ hidden:false,events:{},documentElement,getElementById:id=>({'home-carousel':root,'home-carousel-stage':stage,'home-carousel-controls':controls}[id]),createElement:tag=>new Node(tag),addEventListener(event,fn){this.events[event]=fn;} };
  const reduced={matches:reduce,events:{},addEventListener(event,fn){this.events[event]=fn;}};
  let tick=null,themeObserver=null;
  class MutationObserver { constructor(callback) { themeObserver=callback; } observe() {} }
  const context=vm.createContext({document,window:{MutationObserver},matchMedia:()=>reduced,fetch:async()=>({ok:true,json:async()=>data}),setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{tick=null;},setTimeout:fn=>{fn();return 1;}});
  vm.runInContext(read('home-carousel-client.js'),context);
  return {root,stage,controls,reduced,get tick(){return tick;},photo(){return stage.children[0]?.children[0]?.children.find(n=>n.tagName==='img');},source(){return stage.children[0]?.children[0]?.children.find(n=>n.tagName==='source');},setDark(value){documentElement.classList[value?'add':'remove']('reloja-dark'); themeObserver?.([{attributeName:'class'}]);}};
}
test('loop volta ao primeiro slide; interação pausa e retoma sem recriar controles', async () => {
  const app=clientHarness({autoplay:true,interval:7,slides:[1,2,3].map(n=>({image:'/image-'+n,alt:'Relógio '+n}))});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.photo().src,'/image-1');
  const buttons=app.controls.children;
  for (const src of ['/image-2','/image-3','/image-1']) { app.tick(); assert.equal(app.photo().src,src); }
  assert.equal(app.controls.children,buttons);
  app.root.emit('focusin'); assert.equal(app.tick,null);
  app.root.emit('focusout',{relatedTarget:null}); assert.equal(typeof app.tick,'function');
  app.root.emit('pointerenter'); assert.equal(app.tick,null); app.root.emit('pointerleave'); assert.equal(typeof app.tick,'function');
  assert.equal(app.controls.hidden,true); assert.equal(app.controls.children.length,0);
  app.root.emit('keydown',{key:'ArrowRight',preventDefault(){}}); assert.equal(app.photo().src,'/image-2');
  app.stage.emit('pointerdown',{clientX:200,clientY:100,pointerId:7,pointerType:'mouse',button:0});
  assert.equal(app.stage.captured,null); assert.equal(app.stage.classList.contains('is-dragging'),true);
  let prevented=false; app.stage.emit('pointermove',{clientX:130,clientY:103,pointerId:7,pointerType:'mouse',cancelable:true,preventDefault(){prevented=true;}}); assert.equal(prevented,true); assert.equal(app.stage.captured,7); assert.equal(app.photo().src,'/image-2');
  assert.equal(app.stage.children.length,2); assert.equal(app.stage.children[0].style.transform,'translate3d(-70px,0,0)'); assert.equal(app.stage.children[1].children[0].children.find(n=>n.tagName==='img').src,'/image-3');
  app.stage.emit('pointermove',{clientX:80,clientY:105,pointerId:7,pointerType:'mouse',cancelable:true,preventDefault(){}}); assert.equal(app.photo().src,'/image-2');
  app.stage.emit('pointerup',{clientX:70,clientY:105,pointerId:7}); assert.equal(app.photo().src,'/image-3');
  assert.equal(app.stage.captured,null); assert.equal(app.stage.classList.contains('is-dragging'),false); assert.equal(typeof app.tick,'function');
});
test('controles visuais ficam ocultos e navegação por arraste/teclado permanece disponível', async () => {
  const app=clientHarness({autoplay:true,slides:[{image:'/one',alt:'Um'},{image:'/two',alt:'Dois'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.controls.hidden,true);
  assert.equal(app.controls.children.length,0);
  assert.equal(app.controls.querySelectorAll('[data-slide]').length,0);
  assert.equal(app.controls.querySelector('[data-play]'),null);
  assert.match(read('home-carousel-client.js'),/controls\.hidden = true/);
  assert.match(read('home-carousel-client.js'),/ArrowLeft.*ArrowRight/s);
});
test('título e CTA compactos ficam restritos à vitrine integrada e preservam toque no celular', () => {
  const css=read('home-carousel.css');
  assert.match(css,/\.home-selection \.home-selection-head :is\(h1,h2\)\{[^}]*font:700 clamp\(/);
  assert.match(css,/\.home-selection \.home-selection-head>\.btn\{[^}]*min-height:40px;[^}]*padding:8px 14px;[^}]*font-size:\.75rem/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*\.home-selection--opening \.home-selection-head>\.btn\{[\s\S]*min-height:40px/);
  assert.match(read('index.html'),/home-carousel\.css\?v=20260919-home-review-3/);
  assert.match(read('index.html'),/class="btn btn-outline" href="produtos.html">Ver produtos/);
  assert.match(read('index.html'),/id="analog-clock-brasilia"/);
  assert.match(read('style.css'),/\.btn\{[^}]*padding:14px 26px/);
});
test('movimento reduzido impede avanço automático e ausência de fotos não mostra controles', async () => {
  const app=clientHarness({autoplay:true,slides:[{image:'/one',alt:'Um'},{image:'/two',alt:'Dois'}]},true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.tick,null); assert.equal(app.controls.querySelector('[data-play]'),null);
  assert.equal(app.controls.hidden,true); assert.equal(app.controls.children.length,0);
  assert.equal(app.photo().src,'/one');
  const empty=clientHarness({autoplay:true,slides:[]}); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(empty.controls.hidden,true); assert.equal(empty.tick,null);
  assert.equal(empty.stage.children[0].className,'home-carousel-placeholder');
});
test('modo escuro troca as fotos de computador e celular e volta às claras', async () => {
  const app=clientHarness({slides:[{image:'/light-desktop',mobile_image:'/light-mobile',dark_image:'/dark-desktop',dark_mobile_image:'/dark-mobile',alt:'Relógios'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.photo().src,'/light-desktop'); assert.equal(app.source().srcset,'/light-mobile');
  app.setDark(true); assert.equal(app.photo().src,'/dark-desktop'); assert.equal(app.source().srcset,'/dark-mobile');
  app.setDark(false); assert.equal(app.photo().src,'/light-desktop'); assert.equal(app.source().srcset,'/light-mobile');
  assert.match(read('admin-home-carousel.js'),/dark_image.*dark_mobile_image/);
});
test('troca de slide usa transição cruzada suave sem contrariar movimento reduzido', () => {
  const client=read('home-carousel-client.js'),css=read('home-carousel.css');
  assert.match(client,/duration:700/);
  assert.match(client,/cubic-bezier\(\.4,0,\.2,1\)/);
  assert.match(client,/reduced\.matches.*frame\.animate/s);
  assert.match(css,/\.home-carousel-frame\{position:absolute;inset:0;will-change:opacity/);
});
test('arraste horizontal captura o ponteiro, ignora movimento vertical e bloqueia o arraste nativo da imagem', async () => {
  const app=clientHarness({slides:[{image:'/one',alt:'Um'},{image:'/two',alt:'Dois'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.photo().draggable,false);
  let nativePrevented=false; app.stage.emit('dragstart',{preventDefault(){nativePrevented=true;}}); assert.equal(nativePrevented,true);
  app.stage.emit('pointerdown',{clientX:200,clientY:100,pointerId:9,pointerType:'touch',button:0});
  app.stage.emit('pointerup',{clientX:190,clientY:180,pointerId:9}); assert.equal(app.photo().src,'/one');
  app.stage.emit('pointerdown',{clientX:200,clientY:100,pointerId:10,pointerType:'touch',button:0});
  app.stage.emit('pointercancel',{clientX:120,clientY:100,pointerId:10}); assert.equal(app.photo().src,'/one'); assert.equal(app.stage.captured,null);
  assert.match(read('home-carousel.css'),/touch-action:pan-y;cursor:grab;user-select:none/);
  assert.match(read('home-carousel-client.js'),/setPointerCapture/);
});
test('clique simples permanece no link e somente um arraste real bloqueia a navegação acidental', async () => {
  const app=clientHarness({slides:[{image:'/one',alt:'Um',href:'produtos.html'},{image:'/two',alt:'Dois',href:'produtos.html?marca=Casio'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.stage.children[0].tagName,'a'); assert.equal(app.stage.children[0].href,'produtos.html');
  app.stage.emit('pointerdown',{clientX:200,clientY:100,pointerId:21,pointerType:'mouse',button:0});
  app.stage.emit('pointerup',{clientX:200,clientY:100,pointerId:21});
  let simpleBlocked=false; app.stage.emit('click',{preventDefault(){simpleBlocked=true;}}); assert.equal(simpleBlocked,false);
  app.stage.emit('pointerdown',{clientX:200,clientY:100,pointerId:22,pointerType:'mouse',button:0});
  app.stage.emit('pointermove',{clientX:80,clientY:100,pointerId:22,pointerType:'mouse',cancelable:true,preventDefault(){}});
  app.stage.emit('pointerup',{clientX:80,clientY:100,pointerId:22});
  let dragBlocked=false; app.stage.emit('click',{preventDefault(){dragBlocked=true;}}); assert.equal(dragBlocked,true);
});
test('falha de persistência restaura o carrossel anterior e não responde sucesso', async () => {
  const handlers=new Map(); const fakeFile=new Map([[FILE,JSON.stringify({revision:0,slides:[]})]]);
  const fileSystem={readFileSync:file=>fakeFile.get(file),writeFileSync:(file,value)=>fakeFile.set(file,value),mkdirSync(){}};
  const context=vm.createContext({require:name=>name==='fs'?fileSystem:name==='./admin-session'?{authenticatedRequest:()=>({access_level:'owner'})}:name==='./persistent-store'?{flushPersistentStore:async()=>{throw Error('database unavailable');}}:require(name),module:{exports:{}},__dirname:path.join(__dirname,'..'),process,Buffer,console});
  vm.runInContext(read('home-carousel.js'),context);
  context.module.exports.registerHomeCarouselRoutes({get(){},put:(url,auth,fn)=>handlers.set(url,fn)});
  const response={code:200,status(value){this.code=value;return this;},json(value){this.value=value;return this;}};
  await handlers.get('/api/admin/home-carousel')({body:input([slide()])},response);
  assert.equal(response.code,503); assert.equal(JSON.parse(fakeFile.get(FILE)).revision,0); assert.equal(JSON.parse(fakeFile.get(FILE)).slides.length,0);
});
