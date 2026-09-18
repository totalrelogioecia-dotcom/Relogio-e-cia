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
const slide = (id='one', enabled=true) => ({ id, enabled, image:png, mobile_image:'', alt:'Relógio em fundo claro', href:'produtos.html?marca=Casio' });
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
});
test('resposta pública preserva ordem e omite fotos inativas e dados brutos', () => {
  const data = publicCarousel({...normalizeCarousel(input([slide('second'),slide('off',false),slide('first')])),revision:4});
  assert.deepEqual(data.slides.map(s=>s.id), ['second','first']);
  assert.equal(data.slides[0].image, '/api/home-carousel/images/second/desktop?v=4');
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
    const savedResponse = await request('/api/admin/home-carousel','owner','PUT',input([slide('one'),slide('disabled',false)]));
    assert.equal(savedResponse.status,200);
    const saved = await savedResponse.json(); assert.equal(saved.revision,1);
    assert.equal(JSON.parse(fs.readFileSync(FILE,'utf8')).slides[0].image,png);
    assert.equal((await request('/api/admin/home-carousel','owner','PUT',input())).status,409);
    const publicData = await (await request('/api/home-carousel')).json(); assert.equal(publicData.slides.length,1);
    const photo = await request(publicData.slides[0].image); assert.equal(photo.status,200); assert.equal(photo.headers.get('content-type'),'image/png'); assert.equal(photo.headers.get('x-content-type-options'),'nosniff');
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
    constructor(tag='div') { this.tagName=tag; this.children=[]; this.dataset={}; this.attrs={}; this.events={}; this.hidden=false; this.textContent=''; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=nodes; }
    setAttribute(key,value) { this.attrs[key]=value; }
    addEventListener(event,callback) { (this.events[event] ||= []).push(callback); }
    emit(event,value={}) { for (const fn of this.events[event] || []) fn(value); }
    querySelectorAll(selector) { return this.children.flatMap(n=>[n,...n.querySelectorAll(selector)]).filter(n=>selector==='[data-slide]' ? n.dataset.slide !== undefined : selector==='[data-play]' ? n.dataset.play !== undefined : false); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const root=new Node(),stage=new Node(),controls=new Node(); root.append(stage,controls);
  const document={ hidden:false,events:{},getElementById:id=>({'home-carousel':root,'home-carousel-stage':stage,'home-carousel-controls':controls}[id]),createElement:tag=>new Node(tag),addEventListener(event,fn){this.events[event]=fn;} };
  const reduced={matches:reduce,events:{},addEventListener(event,fn){this.events[event]=fn;}};
  let tick=null;
  const context=vm.createContext({document,window:{},matchMedia:()=>reduced,fetch:async()=>({ok:true,json:async()=>data}),setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{tick=null;}});
  vm.runInContext(read('home-carousel-client.js'),context);
  return {root,stage,controls,reduced,get tick(){return tick;},photo(){return stage.children[0]?.children[0]?.children.find(n=>n.tagName==='img');}};
}
test('loop volta ao primeiro slide; interação pausa sem recriar controles focados', async () => {
  const app=clientHarness({autoplay:true,interval:7,slides:[1,2,3].map(n=>({image:'/image-'+n,alt:'Relógio '+n}))});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.photo().src,'/image-1');
  const buttons=app.controls.children;
  for (const src of ['/image-2','/image-3','/image-1']) { app.tick(); assert.equal(app.photo().src,src); }
  assert.equal(app.controls.children,buttons);
  app.root.emit('focusin'); assert.equal(app.tick,null);
  app.controls.querySelector('[data-play]').emit('click'); assert.equal(typeof app.tick,'function');
  app.root.emit('pointerenter'); assert.equal(app.tick,null);
  app.controls.children[2].emit('click'); assert.equal(app.photo().src,'/image-2'); assert.equal(app.tick,null);
  app.stage.emit('pointerdown',{clientX:200}); app.stage.emit('pointerup',{clientX:100}); assert.equal(app.photo().src,'/image-3');
});
test('controles compactos usam bolinhas e ícone com descrição acessível e alvo de 44px', async () => {
  const app=clientHarness({autoplay:true,slides:[{image:'/one',alt:'Um'},{image:'/two',alt:'Dois'}]});
  await new Promise(resolve=>setImmediate(resolve));
  const dots=app.controls.querySelectorAll('[data-slide]');
  assert.equal(dots.length,2);
  assert.equal(dots[0].textContent,'');
  assert.equal(dots[0].attrs['aria-label'],'Mostrar slide 1');
  assert.equal(dots[0].attrs['aria-current'],'true');
  const play=app.controls.querySelector('[data-play]'),icon=play.children[0];
  assert.equal(play.textContent,'');
  assert.equal(icon.attrs['aria-hidden'],'true');
  assert.equal(play.dataset.state,'pause');
  assert.equal(play.attrs['aria-label'],'Pausar troca automática');
  play.emit('click');
  assert.equal(play.dataset.state,'play');
  assert.equal(play.attrs['aria-label'],'Reproduzir troca automática');
  assert.equal(play.children[0],icon);
  assert.match(read('home-carousel.css'),/width:44px;height:44px;min-width:44px;min-height:44px/);
  assert.match(read('home-carousel.css'),/home-carousel-dots button::before.*width:8px;height:8px/);
});
test('título e CTA compactos ficam restritos ao cabeçalho do carrossel e preservam toque no celular', () => {
  const css=read('home-carousel.css');
  assert.match(css,/\.home-selection \.home-selection-head h2\{[^}]*font:700 1\.5rem\/1\.25/);
  assert.match(css,/\.home-selection \.home-selection-head>\.btn\{[^}]*min-height:40px;[^}]*padding:8px 14px;[^}]*font-size:\.75rem/);
  assert.match(css,/@media\(max-width:760px\)\{\.home-selection \.home-selection-head h2\{font-size:1\.25rem\}\.home-selection \.home-selection-head>\.btn\{min-height:44px\}/);
  assert.match(read('index.html'),/home-carousel\.css\?v=20260918-heading-3/);
  assert.match(read('index.html'),/class="btn btn-outline" href="produtos.html">Ver todos os produtos/);
  assert.match(read('style.css'),/\.btn\{[^}]*padding:14px 26px/);
});
test('movimento reduzido impede avanço automático e ausência de fotos não mostra controles', async () => {
  const app=clientHarness({autoplay:true,slides:[{image:'/one',alt:'Um'},{image:'/two',alt:'Dois'}]},true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.tick,null); assert.equal(app.controls.querySelector('[data-play]').disabled,true);
  app.controls.children[2].emit('click'); assert.equal(app.photo().src,'/two');
  const empty=clientHarness({autoplay:true,slides:[]}); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(empty.controls.hidden,true); assert.equal(empty.tick,null);
  assert.equal(empty.stage.children[0].className,'home-carousel-placeholder');
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
