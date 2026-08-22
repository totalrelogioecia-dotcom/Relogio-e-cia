const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const express=require('express');
const DATA=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'data');
const FILE=path.join(DATA,'product-details.json');
function read(){try{const v=JSON.parse(fs.readFileSync(FILE,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}}
function write(v){fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(FILE,JSON.stringify(v,null,2),'utf8')}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function validAdminToken(value){try{const [body,sig]=String(value||'').split('.');if(!body||!sig)return false;const secret=String(process.env.ADMIN_SESSION_SECRET||'').trim();if(!secret)return false;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return false;const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));return payload.role==='admin'&&payload.exp>Date.now()}catch{return false}}
function admin(req,res,next){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!validAdminToken(token))return res.status(401).json({error:'Sessão administrativa inválida ou expirada.'});next()}
const clean=v=>String(v||'').trim().slice(0,500);
function normalize(body){return {movimento:clean(body.movimento),caixa_material:clean(body.caixa_material),pulseira_material:clean(body.pulseira_material),cor:clean(body.cor),diametro:clean(body.diametro),resistencia_agua:clean(body.resistencia_agua),vidro:clean(body.vidro),garantia:clean(body.garantia),conteudo_embalagem:clean(body.conteudo_embalagem),updated_at:new Date().toISOString()}}
function registerProductDetailsRoutes(app){
 app.use('/api/admin/product-details',express.json({limit:'256kb'}));
 app.get('/api/product-details',(req,res)=>{res.set('Cache-Control','no-store');res.json(read())});
 app.get('/api/admin/product-details',admin,(req,res)=>{res.set('Cache-Control','no-store');res.json(read())});
 app.put('/api/admin/product-details/:id',admin,(req,res)=>{const id=String(req.params.id||'').trim();if(!id)return res.status(400).json({error:'Produto inválido.'});const map=read();map[id]=normalize(req.body||{});write(map);res.json(map[id])});
}
module.exports={registerProductDetailsRoutes,PRODUCT_DETAILS_FILE:FILE};

