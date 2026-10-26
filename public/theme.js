(function () {
  var theme;
  try { theme = localStorage.getItem('aicte-theme'); } catch (_) {}
  if (theme !== 'dark' && theme !== 'light') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#171b1f' : '#f7f7f4');
})();
