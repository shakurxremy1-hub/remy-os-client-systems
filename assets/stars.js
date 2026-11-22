/* Builds the star layers for every .stars element and pauses them when off-screen. */
(function(){
  var COUNTS=[700,200,100];
  function shadows(n,w){var s=[];for(var i=0;i<n;i++)s.push((Math.random()*w|0)+'px '+(Math.random()*2000|0)+'px #fff');return s.join(',')}
  function init(el){
    var w=Math.max(screen.width||0,innerWidth,1600),speed=parseFloat(el.dataset.speed)||1;
    el.style.setProperty('--speed',speed);
    COUNTS.forEach(function(n){
      var i=document.createElement('i'),sh=shadows(n,w);
      i.style.boxShadow=sh;i.style.setProperty('--sh',sh);el.appendChild(i);
    });
  }
  var els=document.querySelectorAll('.stars');
  if(!els.length)return;
  els.forEach(init);
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){e.target.classList.toggle('off',!e.isIntersecting)})});
    els.forEach(function(e){io.observe(e)});
  }
})();
