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

  function uniquePhotos(){
    const values=Array.from(root.querySelectorAll('.product-thumb[data-photo]'))
      .map(button=>String(button.dataset.photo||'').trim())
      .filter(Boolean);
    const main=root.querySelector('#product-main-photo img');
    const mainSrc=main?.currentSrc||main?.src||'';
    if(mainSrc)values.unshift(mainSrc);
    return Array.from(new Set(values));
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
    if(!box||!img||box.dataset.zoomReady==='1')return;
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
  observer.observe(root,{childList:true,subtree:true});
  enhanceMainPhoto();
})();
