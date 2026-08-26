(function(){
  const root=document.getElementById('product-page');
  if(!root)return;

  let overlay=null;
  let zoomImage=null;
  let stage=null;
  let levelLabel=null;
  let prevButton=null;
  let nextButton=null;
  let photos=[];
  let currentIndex=0;
  let scale=1;
  let offsetX=0;
  let offsetY=0;
  let dragging=false;
  let dragStartX=0;
  let dragStartY=0;
  let dragOriginX=0;
  let dragOriginY=0;
  let fitToken=0;
  let resizeTimer=null;

  function uniquePhotos(){
    const values=Array.from(root.querySelectorAll('.product-thumb[data-photo]'))
      .map(button=>String(button.dataset.photo||'').trim())
      .filter(Boolean);
    const main=root.querySelector('#product-main-photo img');
    const mainSrc=main?.currentSrc||main?.src||'';
    if(mainSrc)values.unshift(mainSrc);
    return Array.from(new Set(values));
  }

  function originalCasioUrl(value){
    try{
      const url=new URL(String(value||''),location.href);
      if(url.hostname==='www.casio.com'&&url.pathname.startsWith('/content/dam/casio/'))return url.toString();
      if(url.origin===location.origin&&url.pathname==='/api/image-proxy'){
        const original=url.searchParams.get('url')||'';
        const parsed=new URL(original);
        if(parsed.hostname==='www.casio.com'&&parsed.pathname.startsWith('/content/dam/casio/'))return parsed.toString();
      }
    }catch{}
    return '';
  }

  function analysisSource(img){
    const src=img.currentSrc||img.src||'';
    const casio=originalCasioUrl(src);
    if(casio)return `/api/image-proxy?url=${encodeURIComponent(casio)}`;
    try{
      const url=new URL(src,location.href);
      if(url.origin===location.origin)return url.toString();
    }catch{}
    return src;
  }

  function loadImageForAnalysis(src){
    return new Promise((resolve,reject)=>{
      const probe=new Image();
      try{
        const url=new URL(src,location.href);
        if(url.origin!==location.origin)probe.crossOrigin='anonymous';
      }catch{}
      probe.onload=()=>resolve(probe);
      probe.onerror=()=>reject(new Error('Não foi possível analisar a foto.'));
      probe.src=src;
    });
  }

  function visibleBounds(image){
    const longest=Math.max(image.naturalWidth||0,image.naturalHeight||0);
    if(!longest)return null;
    const ratio=Math.min(1,160/longest);
    const width=Math.max(1,Math.round(image.naturalWidth*ratio));
    const height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const canvas=document.createElement('canvas');
    canvas.width=width;
    canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)return null;
    ctx.drawImage(image,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height).data;

    const cornerSize=Math.max(2,Math.round(Math.min(width,height)*.045));
    let bgR=255,bgG=255,bgB=255,bgA=0,bgCount=0;
    let sumR=0,sumG=0,sumB=0,sumA=0;
    const isCorner=(x,y)=>
      (x<cornerSize&&y<cornerSize)||
      (x>=width-cornerSize&&y<cornerSize)||
      (x<cornerSize&&y>=height-cornerSize)||
      (x>=width-cornerSize&&y>=height-cornerSize);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      if(!isCorner(x,y))continue;
      const i=(y*width+x)*4;
      sumR+=pixels[i];sumG+=pixels[i+1];sumB+=pixels[i+2];sumA+=pixels[i+3];bgCount++;
    }
    if(bgCount){bgR=sumR/bgCount;bgG=sumG/bgCount;bgB=sumB/bgCount;bgA=sumA/bgCount;}
    const transparentBackground=bgA<70;

    let minX=width,minY=height,maxX=-1,maxY=-1,found=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];
      if(a<35)continue;
      const distance=Math.abs(r-bgR)+Math.abs(g-bgG)+Math.abs(b-bgB);
      const luminance=(r+g+b)/3;
      const foreground=transparentBackground?a>48:(distance>55||luminance<225);
      if(!foreground)continue;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);found++;
    }
    if(!found||maxX<=minX||maxY<=minY)return null;
    if(((maxX-minX)*(maxY-minY))/(width*height)<.015)return null;
    return {minX,minY,maxX,maxY,width,height};
  }

  async function fitMainImage(box,img){
    const token=++fitToken;
    if(!window.matchMedia('(min-width: 961px)').matches){
      img.style.transform='';
      img.style.transformOrigin='';
      return;
    }

    try{
      const probe=await loadImageForAnalysis(analysisSource(img));
      if(token!==fitToken)return;
      const bounds=visibleBounds(probe);
      if(!bounds)return;

      const boxWidth=box.clientWidth;
      const boxHeight=box.clientHeight;
      if(!boxWidth||!boxHeight)return;

      const naturalWidth=probe.naturalWidth;
      const naturalHeight=probe.naturalHeight;
      const contain=Math.min(boxWidth/naturalWidth,boxHeight/naturalHeight);
      const renderedWidth=naturalWidth*contain;
      const renderedHeight=naturalHeight*contain;
      const originX=(boxWidth-renderedWidth)/2;
      const originY=(boxHeight-renderedHeight)/2;

      const left=originX+(bounds.minX/bounds.width)*renderedWidth;
      const right=originX+((bounds.maxX+1)/bounds.width)*renderedWidth;
      const top=originY+(bounds.minY/bounds.height)*renderedHeight;
      const bottom=originY+((bounds.maxY+1)/bounds.height)*renderedHeight;
      const visibleWidth=Math.max(1,right-left);
      const visibleHeight=Math.max(1,bottom-top);
      const margin=14;

      const allowedScale=Math.min(
        1.55,
        (boxWidth-margin*2)/visibleWidth,
        (boxHeight-margin*2)/visibleHeight
      );
      const fittedScale=Math.max(1,allowedScale);
      const centerX=boxWidth/2;
      const centerY=boxHeight/2;
      const visibleCenterX=(left+right)/2;
      const transformedCenterX=centerX+(visibleCenterX-centerX)*fittedScale;
      let translateX=centerX-transformedCenterX;

      const transformedTop=centerY+(top-centerY)*fittedScale;
      const transformedBottom=centerY+(bottom-centerY)*fittedScale;
      let translateY=margin-transformedTop;
      if(transformedBottom+translateY>boxHeight-margin){
        translateY-=transformedBottom+translateY-(boxHeight-margin);
      }

      const transformedLeft=centerX+(left-centerX)*fittedScale+translateX;
      const transformedRight=centerX+(right-centerX)*fittedScale+translateX;
      if(transformedLeft<margin)translateX+=margin-transformedLeft;
      if(transformedRight>boxWidth-margin)translateX-=transformedRight-(boxWidth-margin);

      img.style.transformOrigin='center center';
      img.style.transform=`translate(${Math.round(translateX)}px, ${Math.round(translateY)}px) scale(${fittedScale.toFixed(3)})`;
      box.classList.add('product-photo-auto-fitted');
    }catch{
      if(token!==fitToken)return;
      img.style.transform='';
      img.style.transformOrigin='';
      box.classList.remove('product-photo-auto-fitted');
    }
  }

  function scheduleFit(box,img){
    const run=()=>fitMainImage(box,img);
    if(img.complete&&img.naturalWidth)run();
    else img.addEventListener('load',run,{once:true});
  }

  function ensureOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.className='product-zoom-overlay';
    overlay.hidden=true;
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Foto ampliada do produto');
    overlay.innerHTML=`
      <div class="product-zoom-topbar">
        <div class="product-zoom-title" id="product-zoom-title">Foto do produto</div>
        <div class="product-zoom-controls">
          <button type="button" class="product-zoom-button" data-zoom-out aria-label="Diminuir zoom">−</button>
          <span class="product-zoom-level" aria-live="polite">100%</span>
          <button type="button" class="product-zoom-button" data-zoom-in aria-label="Aumentar zoom">+</button>
          <button type="button" class="product-zoom-button" data-zoom-reset aria-label="Restaurar zoom">1:1</button>
          <button type="button" class="product-zoom-button" data-zoom-close aria-label="Fechar zoom">×</button>
        </div>
      </div>
      <div class="product-zoom-stage">
        <button type="button" class="product-zoom-nav product-zoom-prev" data-zoom-prev aria-label="Foto anterior">‹</button>
        <img alt="Foto ampliada do produto" draggable="false">
        <button type="button" class="product-zoom-nav product-zoom-next" data-zoom-next aria-label="Próxima foto">›</button>
      </div>
      <div class="product-zoom-help">Clique na foto para ampliar · use + / − ou a roda do mouse · arraste quando estiver ampliada · Esc fecha</div>`;
    document.body.appendChild(overlay);

    zoomImage=overlay.querySelector('.product-zoom-stage img');
    stage=overlay.querySelector('.product-zoom-stage');
    levelLabel=overlay.querySelector('.product-zoom-level');
    prevButton=overlay.querySelector('[data-zoom-prev]');
    nextButton=overlay.querySelector('[data-zoom-next]');

    overlay.querySelector('[data-zoom-close]').addEventListener('click',closeZoom);
    overlay.querySelector('[data-zoom-in]').addEventListener('click',()=>setScale(scale+.5));
    overlay.querySelector('[data-zoom-out]').addEventListener('click',()=>setScale(scale-.5));
    overlay.querySelector('[data-zoom-reset]').addEventListener('click',resetTransform);
    prevButton.addEventListener('click',()=>showPhoto(currentIndex-1));
    nextButton.addEventListener('click',()=>showPhoto(currentIndex+1));

    stage.addEventListener('wheel',event=>{
      event.preventDefault();
      setScale(scale+(event.deltaY<0?.25:-.25));
    },{passive:false});

    stage.addEventListener('pointerdown',event=>{
      if(scale<=1)return;
      dragging=true;
      dragStartX=event.clientX;
      dragStartY=event.clientY;
      dragOriginX=offsetX;
      dragOriginY=offsetY;
      stage.classList.add('is-dragging');
      stage.setPointerCapture?.(event.pointerId);
    });

    stage.addEventListener('pointermove',event=>{
      if(!dragging)return;
      offsetX=dragOriginX+(event.clientX-dragStartX);
      offsetY=dragOriginY+(event.clientY-dragStartY);
      applyTransform();
    });

    const stopDrag=event=>{
      if(!dragging)return;
      dragging=false;
      stage.classList.remove('is-dragging');
      try{stage.releasePointerCapture?.(event.pointerId)}catch{}
    };
    stage.addEventListener('pointerup',stopDrag);
    stage.addEventListener('pointercancel',stopDrag);

    overlay.addEventListener('click',event=>{
      if(event.target===overlay)closeZoom();
    });

    document.addEventListener('keydown',event=>{
      if(!overlay||overlay.hidden)return;
      if(event.key==='Escape')closeZoom();
      else if(event.key==='ArrowLeft')showPhoto(currentIndex-1);
      else if(event.key==='ArrowRight')showPhoto(currentIndex+1);
      else if(event.key==='+'||event.key==='=')setScale(scale+.5);
      else if(event.key==='-')setScale(scale-.5);
      else if(event.key==='0')resetTransform();
    });

    return overlay;
  }

  function applyTransform(){
    if(!zoomImage)return;
    zoomImage.style.transform=`translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    stage?.classList.toggle('is-zoomed',scale>1);
    if(levelLabel)levelLabel.textContent=`${Math.round(scale*100)}%`;
  }

  function setScale(next){
    const clamped=Math.min(4,Math.max(1,Math.round(next*4)/4));
    scale=clamped;
    if(scale===1){offsetX=0;offsetY=0;}
    applyTransform();
  }

  function resetTransform(){
    scale=1;
    offsetX=0;
    offsetY=0;
    applyTransform();
  }

  function showPhoto(index){
    if(!photos.length)return;
    currentIndex=(index+photos.length)%photos.length;
    resetTransform();
    zoomImage.src=photos[currentIndex];
    const mainAlt=root.querySelector('#product-main-photo img')?.alt||'Foto do produto';
    zoomImage.alt=`${mainAlt} — ampliada`;
    const title=overlay.querySelector('#product-zoom-title');
    if(title)title.textContent=`${mainAlt} · foto ${currentIndex+1} de ${photos.length}`;
    const multiple=photos.length>1;
    prevButton.hidden=!multiple;
    nextButton.hidden=!multiple;
  }

  function openZoom(){
    const main=root.querySelector('#product-main-photo img');
    if(!main)return;
    ensureOverlay();
    photos=uniquePhotos();
    const current=main.currentSrc||main.src;
    const found=photos.findIndex(photo=>photo===current||photo===main.src);
    currentIndex=found>=0?found:0;
    showPhoto(currentIndex);
    overlay.hidden=false;
    document.body.classList.add('product-zoom-open');
    overlay.querySelector('[data-zoom-close]')?.focus();
  }

  function closeZoom(){
    if(!overlay)return;
    overlay.hidden=true;
    document.body.classList.remove('product-zoom-open');
    resetTransform();
    root.querySelector('#product-main-photo')?.focus();
  }

  function enhanceMainPhoto(){
    const box=root.querySelector('#product-main-photo');
    const img=box?.querySelector('img');
    if(!box||!img)return;

    scheduleFit(box,img);
    if(box.dataset.zoomReady==='1')return;
    box.dataset.zoomReady='1';
    box.classList.add('has-product-zoom');
    box.setAttribute('role','button');
    box.setAttribute('tabindex','0');
    box.setAttribute('aria-label','Ampliar foto do produto');

    const hint=document.createElement('span');
    hint.className='product-zoom-hint';
    hint.textContent='Clique para ampliar';
    box.appendChild(hint);

    box.addEventListener('click',openZoom);
    box.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();
        openZoom();
      }
    });
  }

  const observer=new MutationObserver(enhanceMainPhoto);
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(enhanceMainPhoto,120);
  });
  enhanceMainPhoto();
})();
