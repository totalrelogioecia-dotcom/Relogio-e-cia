const { URL } = require('url');

const BASE = 'https://www.casio.com/';
const READER = 'https://r.jina.ai/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const cache = new Map();

function cleanSku(raw){
  return String(raw||'').trim().toUpperCase().replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,'').replace(/[^A-Z0-9-]/g,'').replace(/-+/g,'-').slice(0,40);
}
function variants(raw){
  const clean=cleanSku(raw); if(!clean)return [];
  const out=[clean];
  for(const suffix of ['DR','BR','CF','CR','ER','JF','DF']) if(clean.endsWith(suffix)&&clean.length>suffix.length+3) out.push(clean.slice(0,-suffix.length));
  return [...new Set(out)];
}
function decode(v){return String(v||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ').replace(/\\u002F/gi,'/').replace(/\\\//g,'/');}
function plain(content){
  return decode(String(content||''))
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<\/(?:p|div|li|h\d|tr|td|th|dt|dd)>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/^#{1,6}\s*/gm,'')
    .replace(/^[-*+]\s+/gm,'')
    .replace(/\*\*([^*]+)\*\*/g,'$1')
    .replace(/[\t\r]+/g,' ')
    .replace(/ +/g,' ')
    .replace(/\n\s*\n+/g,'\n')
    .trim();
}
function extractMeta(html,key,attr='name'){
  const safe=String(key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const re of [new RegExp(`<meta[^>]+${attr}=["']${safe}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${safe}["']`,'i')]){
    const m=html.match(re); if(m?.[1])return decode(m[1]).replace(/\s+/g,' ').trim();
  }
  return '';
}
function extractTitle(content,sku){
  const html=String(content||'');
  for(const re of [/<h1[^>]*>([\s\S]*?)<\/h1>/i,/<title[^>]*>([\s\S]*?)<\/title>/i,/^#\s+(.+)$/m,/^Title:\s*(.+)$/mi]){
    const m=html.match(re); if(!m)continue;
    const v=decode(m[1]).replace(/<[^>]+>/g,' ').replace(/[*#]/g,'').replace(/\s+/g,' ').replace(/\s*\|\s*CASIO.*$/i,'').trim();
    if(v&&v.toUpperCase().includes(sku))return v;
  }
  return extractMeta(html,'og:title','property').replace(/\s*\|\s*CASIO.*$/i,'').trim()||sku;
}
function pick(text,labels,max=320){
  const lines=String(text||'').split('\n').map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    for(const label of labels){
      const safe=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const m=lines[i].match(new RegExp(`^${safe}\\s*[:：]?\\s*(.*)$`,'i'));
      if(!m)continue;
      let value=String(m[1]||'').trim();
      if(!value&&lines[i+1])value=lines[i+1].trim();
      if(value&&value.length<=max)return value;
    }
  }
  return '';
}
function specs(content){
  const t=plain(content);
  const details={
    movimento:pick(t,['Movimento','Movement','Precisão','Accuracy']),
    caixa_material:pick(t,['Material da caixa e da moldura','Material da caixa e do bisel','Material da caixa','Case and bezel material','Case material']),
    pulseira_material:pick(t,['Pulseira','Bracelete','Band','Material da pulseira']),
    cor:pick(t,['Cor','Color','Cor da pulseira','Band color']),
    diametro:pick(t,['Tamanho do Relógio (Caixa|Visor) C x L x A','Tamanho do Relógio','Tamanho da caixa (C × L × A)','Tamanho da caixa','Case size (L× W× H)','Case size']),
    resistencia_agua:pick(t,['Resistente a água','Resistência à água','Resistência à água de','Water resistance']),
    vidro:pick(t,['Vidro','Glass'])
  };
  return Object.fromEntries(Object.entries(details).filter(([,v])=>String(v||'').trim()));
}
function absoluteImage(raw){
  try{
    const u=new URL(decode(raw).trim(),BASE);
    return u.protocol==='https:'&&u.hostname==='www.casio.com'&&u.pathname.startsWith('/content/dam/casio/')?u.toString():'';
  }catch{return '';}
}
function images(content,sku,max=6){
  const found=[]; const norm=decode(content);
  const patterns=[
    /https:\/\/www\.casio\.com\/content\/dam\/casio\/[^\s"'<>]+/gi,
    /\/content\/dam\/casio\/[^\s"'<>]+/gi
  ];
  for(const re of patterns){
    for(const raw of norm.match(re)||[]){
      const cleaned=raw.replace(/[\])},;]+$/g,'');
      const u=absoluteImage(cleaned);
      if(u&&!found.includes(u)&&/\.(?:png|jpe?g|webp)(?:\.|\?|$)/i.test(u))found.push(u);
    }
  }
  const compact=sku.toLowerCase().replace(/-/g,'');
  const score=u=>{
    const l=u.toLowerCase(),c=l.replace(/-/g,''); let n=0;
    if(l.includes(sku.toLowerCase()))n+=120;
    if(c.includes(compact))n+=90;
    if(/assets|main-visual|seq1|seq2|seq3|_01|_02|_03/.test(l))n+=20;
    if(/icon|logo|banner|payment|feature|size|scene|manual|qr/.test(l))n-=100;
    return n;
  };
  return found.sort((a,b)=>score(b)-score(a)).filter(u=>score(u)>0).slice(0,max);
}
async function fetchTimed(url,timeout=8000,headers={}){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(url,{signal:controller.signal,redirect:'follow',headers:{'User-Agent':USER_AGENT,'Accept-Language':'pt-BR,pt;q=0.9,en;q=0.7',...headers}});}
  finally{clearTimeout(timer);}
}
function candidates(sku){
  // Tentamos mais de um catálogo oficial porque alguns modelos aparecem em uma região
  // antes de outra. Ex.: W-218H-1AV está disponível no Brasil, Portugal, Latin e Intl.
  return [
    {brand:'Casio',url:`https://www.casio.com/br/watches/casio/product.${encodeURIComponent(sku)}/`},
    {brand:'G-Shock',url:`https://www.casio.com/br/watches/gshock/product.${encodeURIComponent(sku)}/`},
    {brand:'Casio',url:`https://www.casio.com/pt/watches/casio/product.${encodeURIComponent(sku)}/`},
    {brand:'G-Shock',url:`https://www.casio.com/pt/watches/gshock/product.${encodeURIComponent(sku)}/`},
    {brand:'Casio',url:`https://www.casio.com/latin/watches/casio/product.${encodeURIComponent(sku)}/`},
    {brand:'G-Shock',url:`https://www.casio.com/latin/watches/gshock/product.${encodeURIComponent(sku)}/`},
    {brand:'Casio',url:`https://www.casio.com/intl/watches/casio/product.${encodeURIComponent(sku)}/`},
    {brand:'G-Shock',url:`https://www.casio.com/intl/watches/gshock/product.${encodeURIComponent(sku)}/`}
  ];
}
function containsSku(content,sku){
  const t=plain(content).toUpperCase();
  return t.includes(sku)||t.replace(/-/g,'').includes(sku.replace(/-/g,''));
}
function urlMatchesSku(url,sku){
  try{
    const path=decodeURIComponent(new URL(url).pathname).toUpperCase();
    return path.includes(`PRODUCT.${sku}`)||path.replace(/-/g,'').includes(`PRODUCT.${sku.replace(/-/g,'')}`);
  }catch{return false;}
}
async function directPage(candidate,sku){
  try{
    const r=await fetchTimed(candidate.url,8500,{'Accept':'text/html,application/xhtml+xml','Cache-Control':'no-cache'});
    if(!r.ok)return null;
    const content=await r.text();
    const finalUrl=r.url||candidate.url;
    // Se a URL oficial continua apontando para product.<SKU>, aceitamos a página mesmo
    // quando o HTML inicial é renderizado por JavaScript e ainda não contém a referência.
    if(!containsSku(content,sku)&&!urlMatchesSku(finalUrl,sku)&&!urlMatchesSku(candidate.url,sku))return null;
    return {...candidate,content,finalUrl,via:'direct'};
  }catch{return null;}
}
async function readerPage(candidate,sku){
  try{
    const r=await fetchTimed(`${READER}${candidate.url}`,14000,{'Accept':'text/plain'});
    if(!r.ok)return null;
    const content=await r.text();
    if(!containsSku(content,sku)&&!urlMatchesSku(candidate.url,sku))return null;
    return {...candidate,content,finalUrl:candidate.url,via:'reader'};
  }catch{return null;}
}
async function firstMatch(list,fn,sku){
  const results=await Promise.all(list.map(candidate=>fn(candidate,sku)));
  return results.find(Boolean)||null;
}
async function findPage(raw){
  for(const sku of variants(raw)){
    const list=candidates(sku);
    const direct=await firstMatch(list,directPage,sku);
    if(direct){
      if(plain(direct.content).length<500){
        const reinforced=await readerPage({brand:direct.brand,url:direct.finalUrl||direct.url},sku);
        if(reinforced)return {sku,...reinforced};
      }
      return {sku,...direct};
    }
    const reader=await firstMatch(list,readerPage,sku);
    if(reader)return {sku,...reader};
  }
  return null;
}
function description(content){
  const html=String(content||'');
  const meta=extractMeta(html,'description','name')||extractMeta(html,'og:description','property');
  if(meta)return meta.slice(0,1200);
  const lines=plain(content).split('\n').map(x=>x.trim()).filter(Boolean);
  const useful=lines.find(x=>x.length>40&&x.length<500&&/resistente|cron[oô]metro|alarme|bluetooth|solar|autom[aá]tico|anal[oó]gico|digital/i.test(x));
  return String(useful||'').slice(0,1200);
}
async function enrich(raw){
  const requested=cleanSku(raw);
  if(!requested)throw Object.assign(new Error('Informe uma referência Casio ou G-Shock.'),{statusCode:400});
  if(cache.has(requested))return cache.get(requested);
  const page=await findPage(requested);
  if(!page)throw Object.assign(new Error(`Não encontrei ${requested} nos catálogos oficiais Casio/G-Shock. A referência pode estar correta, mas o catálogo pode estar bloqueando consultas automáticas temporariamente.`),{statusCode:404});
  const detalhes=specs(page.content);
  const fotos=images(page.content,page.sku,6);
  const result={sku:requested,nome:extractTitle(page.content,page.sku),marca:page.brand,categoria:'Relógios',desc:description(page.content),fotos,detalhes,fonte:page.finalUrl,origem:page.brand==='G-Shock'?'Catálogo oficial G-Shock':'Catálogo oficial Casio',aviso:fotos.length?'':'A referência foi confirmada no catálogo oficial, mas nenhuma foto pôde ser extraída automaticamente desta página.'};
  cache.set(requested,result);
  return result;
}
async function fetchImage(url){
  const safe=absoluteImage(url); if(!safe)return null;
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const r=await fetch(safe,{signal:controller.signal,redirect:'follow',headers:{'User-Agent':USER_AGENT,'Accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8','Referer':BASE}});
    if(!r.ok)return null;
    const type=String(r.headers.get('content-type')||''); if(!type.startsWith('image/'))return null;
    return {type,bytes:Buffer.from(await r.arrayBuffer())};
  }finally{clearTimeout(timer);}
}
function handler(req,res){
  enrich(req.query?.sku).then(data=>{res.set('Cache-Control','no-store');res.json(data);}).catch(e=>res.status(Number(e?.statusCode)||502).json({error:e.message||'Não foi possível consultar a Casio/G-Shock.'}));
}
function registerCasioEnrichmentV2(app){
  app.get('/api/casio-enrichment',handler);
  app.get('/api/product-enrichment',handler);
  app.get('/api/casio-v2-image',async(req,res)=>{
    try{
      const image=await fetchImage(String(req.query?.url||''));
      if(!image)return res.status(404).send('Imagem Casio indisponível.');
      res.set('Content-Type',image.type);res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');res.send(image.bytes);
    }catch{res.status(502).send('Não foi possível carregar a imagem Casio.');}
  });
}
module.exports={registerCasioEnrichmentV2};
