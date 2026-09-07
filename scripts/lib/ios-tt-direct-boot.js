/* Runs independently of the large shell. No host writes, dependencies, chat data or network. */
(function () {
  var box = document.getElementById('linjiang-ios-direct-boot');
  if (!box) return;
  var version = box.getAttribute('data-version');
  var phase = 'probe';
  var timer = 0;
  var stopped = false;
  var failure = '';
  var enabled = true;
  var facts = { frame: false, parent: false, tt: false, ios: false };
  try {
    facts.frame = !!window.frameElement;
    var host = window.top || window.parent || window;
    var nav = host.navigator;
    facts.parent = !!host.document;
    facts.tt = !!host.__TAURITAVERN__;
    facts.ios = /iphone|ipad|ipod/i.test(nav.userAgent || '')
      || (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1);
    enabled = facts.ios; // Keep iOS host-misclassification failures observable too.
  } catch (e) {
    // Keep a visible diagnostic when parent access itself fails; do not guess the host.
    phase = 'host-access';
  }
  if (!enabled) { box.remove(); return; }
  function render(state) {
    box.setAttribute('data-state', state);
    box.textContent = '0906 启动检查 · ' + version + ' · ' + state + ' / ' + phase
      + (failure ? ' / ' + failure : '')
      + ' · frame:' + Number(facts.frame) + ' parent:' + Number(facts.parent)
      + ' TT:' + Number(facts.tt) + ' iOS:' + Number(facts.ios);
    window.__linjiangDirectBoot = {
      version: version, state: state, phase: phase, failure: failure, facts: facts
    };
  }
  function onError(event) {
    if (stopped || !(event instanceof ErrorEvent)) return;
    // Do not copy exception messages/URLs: they may contain user or character data.
    failure = (event.error && event.error.name || 'Error') + ':'
      + Number(event.lineno || 0) + ':' + Number(event.colno || 0);
    render('script-error');
  }
  function onRejection() {
    if (!stopped) { failure = 'PromiseError'; render('script-error'); }
  }
  function cleanup() {
    stopped = true;
    clearTimeout(timer);
    removeEventListener('error', onError);
    removeEventListener('unhandledrejection', onRejection);
  }
  window.__linjiangDirectBootPhase = function (next) {
    phase = next;
    // Each real mount attempt starts a new bounded observation window.
    if (next === 'mount') { failure = ''; arm(); }
    if (next === 'ready') {
      render(failure ? 'script-error' : 'ready');
      cleanup();
      box.hidden = !failure;
      return;
    }
    if (!stopped) render(failure ? 'script-error' : 'starting');
  };
  function arm() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!stopped) render(failure ? 'script-error' : 'timeout');
    }, 12000);
  }
  addEventListener('error', onError);
  addEventListener('unhandledrejection', onRejection);
  addEventListener('pagehide', cleanup, { once: true });
  render('starting');
  arm();
})();
