(function(){
  function bind(){
    const grid=document.getElementById('product-grid');
    if(!grid)return;
    grid.addEventListener('click',event=>{
      const detail=event.target.closest('[data-produto]');
      if(detail){event.preventDefault();event.stopImmediatePropagation();location.href=`produto.html?id=${encodeURIComponent(detail.dataset.produto)}`;return}
      const card=event.target.closest('.product-card');
      if(!card)return;
      if(event.target.closest('button,a,input,select'))return;
      const detailButton=card.querySelector('[data-produto]');
      if(detailButton)location.href=`produto.html?id=${encodeURIComponent(detailButton.dataset.produto)}`;
    },true);
    const observer=new MutationObserver(()=>{
      grid.querySelectorAll('.product-card').forEach(card=>{
        card.classList.add('has-product-page');
        const detail=card.querySelector('[data-produto]');
        const id=detail?.dataset.produto;
        if(!id)return;
        const photo=card.querySelector('.card-photo');
        const title=card.querySelector('h4');
        if(photo){photo.style.cursor='pointer';photo.title='Ver detalhes do produto'}
        if(title){title.style.cursor='pointer';title.title='Ver detalhes do produto'}
      });
    });
    observer.observe(grid,{childList:true,subtree:true});
  }
  document.addEventListener('DOMContentLoaded',bind);
})();
