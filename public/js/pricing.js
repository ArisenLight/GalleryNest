(function(){
  const grid = document.querySelector('.gn-grid');
  const monthly = document.getElementById('gn-bill-monthly');
  const yearly = document.getElementById('gn-bill-yearly');
  if (!grid || !monthly || !yearly) return;

  function setBilling(mode){
    grid.setAttribute('data-billing', mode === 'yearly' ? 'yearly' : 'monthly');
  }

  monthly.addEventListener('change', () => setBilling('monthly'));
  yearly.addEventListener('change', () => setBilling('yearly'));

  // default monthly
  setBilling('monthly');
})();
