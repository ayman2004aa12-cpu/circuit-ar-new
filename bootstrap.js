/* Load diagnostics before any module: failed imports must never leave a silent spinner. */
(() => {
  const $ = id => document.getElementById(id);
  let ready = false;
  const fail = (message, error) => {
    clearTimeout(watchdog);
    $('startBtn').disabled = true;
    $('startBtn').textContent = 'تعذر تحميل التجربة';
    $('loadStatus').textContent = message;
    $('tracking').textContent = 'توقف التحميل — راجع الرسالة أدناه';
    $('retryBtn').classList.remove('hidden');
    if (error) console.error('CircuitAR boot:', error);
  };
  const watchdog = setTimeout(() => {
    if (!ready) fail('استغرق التحميل وقتًا طويلًا. تحقق من الإنترنت ووجود مجلد vendor كاملًا، ثم أعد المحاولة.');
  }, 60000);
  $('retryBtn').addEventListener('click', () => location.reload());
  window.addEventListener('error', event => {
    if (!ready && event.error) fail('خطأ في بدء التطبيق: ' + event.message, event.error);
  });
  window.addEventListener('unhandledrejection', event => {
    if (!ready) fail('تعذر تحميل أحد ملفات التجربة: ' + (event.reason?.message || event.reason), event.reason);
  });
  const loadXR = () => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './vendor/8thwall/xr.js';
    script.dataset.preloadChunks = 'slam';
    script.onerror = () => reject(new Error('لم يُحمّل vendor/8thwall/xr.js. تأكد من رفع مجلد vendor.'));
    script.onload = () => { if (window.XR8) resolve(); };
    window.addEventListener('xrloaded', resolve, {once: true});
    document.head.appendChild(script);
  });
  async function boot() {
    if (!window.isSecureContext) throw new Error('افتح التجربة عبر HTTPS للسماح بالكاميرا (أو localhost للاختبار).');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('الكاميرا غير متاحة. افتح الرابط مباشرةً في Safari وراجع أذونات الكاميرا.');
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) throw new Error('يحتاج هذا الإصدار إلى WebGL 2. حدّث iOS أو iPadOS واستخدم Safari على جهاز متوافق.');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    $('loadStatus').textContent = 'تحميل الرسوم ثلاثية الأبعاد…';
    window.THREE = await import('./vendor/three/three.module.js');
    $('loadStatus').textContent = 'تحميل محرك تتبع الأسطح…';
    await loadXR();
    if (!window.XR8?.Threejs || !window.XR8?.XrController) throw new Error('ملفات المحرك ناقصة أو غير متوافقة. أعد رفع vendor كاملًا.');
    const app = await import('./app.js?v=ground-20261112');
    app.initializeApp();
    $('retryBtn').classList.add('hidden');
    if (!$('appStyles').sheet) $('loadStatus').textContent='تعذر تحميل styles.css. نستخدم تنسيقًا احتياطيًا؛ أعد تحميل الصفحة إذا استمرت المشكلة.';
    ready = true;
    clearTimeout(watchdog);
  }
  boot().catch(error => fail(error.message || String(error), error));
})();
