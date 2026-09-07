/** Separate 0906 phone-test delivery. Normal shells stay small and unchanged.
 * Embeds the actual current HUD JS/CSS, not merely a new shell pointing at old Pages.
 * Only TT iOS native flow uses the payload; no shared-manager entry/cache mutation.
 */
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ASSETS_ROOT } from './asset-cdn.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = resolve(root, '外部部署/V20260906');
const sourcePath = resolve(dir, '状态栏-测试版-流内嵌入.html');
const outPath = resolve(dir, '状态栏-测试版-流内嵌入-TT-iOS直测.html');
execFileSync(process.execPath, ['scripts/build-status-shell.mjs', '--check'], { cwd: root, stdio: 'inherit' });
const source = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
const text = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const boot = text(resolve(root, 'scripts/lib/ios-tt-direct-boot.js')).replace(/^\uFEFF/, '');
const hash = createHash('sha256');
hash.update(boot);
function hashTree(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const path = resolve(dir, ent.name);
    if (ent.isDirectory()) hashTree(path);
    else hash.update(relative(root, path).replaceAll('\\', '/')).update('\0').update(text(path));
  }
}
hashTree(resolve(root, 'src'));
hash.update(text(resolve(root, 'package-lock.json'))).update(source).update(ASSETS_ROOT).update(text(fileURLToPath(import.meta.url)));
const version = `tt-ios-0906-${hash.digest('hex').slice(0, 10)}`;
const result = await build({
  root, configFile: false, publicDir: false, base: './', logLevel: 'warn',
  define: { __ASSETS_ROOT__: JSON.stringify(ASSETS_ROOT), __HUD_BUILD__: JSON.stringify(version) },
  build: {
    write: false, target: 'safari15', minify: 'esbuild', cssMinify: 'esbuild', cssCodeSplit: false,
    lib: { entry: resolve(root, 'src/main.js'), name: 'LinjiangDirectHud', formats: ['iife'] },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const output = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
const chunks = output.filter(item => item.type === 'chunk');
const styles = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
if (chunks.length !== 1 || styles.length !== 1 || output.length !== 2 || chunks[0].imports.length
    || chunks[0].dynamicImports.length) throw new Error('Direct HUD must be exactly one self-contained script and one CSS asset');
const js = chunks[0].code;
// The one public URL in tokens.css otherwise resolves against the Tavern srcdoc base.
const css = String(styles[0].source).replaceAll('/assets/frost.png', `${ASSETS_ROOT}frost.png`);
if (!js.includes('hudIosTtFlat') || !css.includes('data-hud-ios-tt-flat')) throw new Error('Missing TT iOS renderer in payload');
// JSON embedded inside an HTML script must not contain a closing script tag or raw HTML opener.
const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
function replaceOnce(text, anchor, replacement) {
  if (text.split(anchor).length !== 2) throw new Error(`Shell integration anchor drifted: ${anchor.slice(0, 100)}`);
  return text.replace(anchor, () => replacement);
}
let packed = replaceOnce(source, '<iframe id="hud"', `<div id="linjiang-ios-direct-boot" data-version="${version}" data-state="html" style="position:absolute;top:0;left:0;right:0;z-index:3;padding:8px;background:#fff3cd;color:#231b00;font:12px/18px monospace;overflow-wrap:anywhere;">0906 \u542f\u52a8\u68c0\u67e5 \u00b7 ${version} \u00b7 HTML \u5df2\u5230\u8fbe\uff0c\u7b49\u5f85\u811a\u672c</div>
<script>
${boot}</script>
<iframe id="hud"`);
packed = replaceOnce(packed, '  const resolveNativeEntry = async () => {', `
  // Generated TT iOS direct-test payload. Never cache this entry in the top-window manager.
  const directVersion = ${literal(version)};
  const directBadgeId = 'linjiang-ios-direct-version';
  const updateDirectBadge = (ready) => {
    if (!isIosTauriTavernMobile()) return;
    let badge = document.getElementById(directBadgeId);
    if (!badge) {
      badge = document.createElement('div');
      badge.id = directBadgeId;
      badge.style.cssText = 'display:block;padding:6px 8px;background:#242840;color:#e8f1ff;font:12px/18px monospace;overflow-wrap:anywhere;';
      mobileNativeRoot.prepend(badge);
    }
    const flat = document.documentElement.dataset.hudIosTtFlat === '1';
    badge.dataset.state = ready ? (flat ? 'flat-ready' : 'renderer-mismatch') : 'loading';
    badge.textContent = 'TT iOS 直测 · ' + directVersion + ' · '
      + (ready ? (flat ? '内嵌 HUD / 平面渲染已启用' : '渲染标记异常') : '内嵌 HUD 加载中');
    window.__linjiangDirectTest = { version: directVersion, state: badge.dataset.state };
  };
  const resolveNativeEntry = async () => {
    if (isIosTauriTavernMobile()) {
      window.__linjiangDirectBootPhase?.('entry');
      updateDirectBadge(false);
      if (!document.getElementById('linjiang-ios-direct-css')) {
        const style = document.createElement('style');
        style.id = 'linjiang-ios-direct-css';
        style.textContent = ${literal(css)};
        document.head.appendChild(style);
      }
      return { base: new URL('.', new URL(HUD_URL, location.href)).href,
        src: 'inline:' + directVersion, css: [], inlineJs: ${literal(js)} };
    }`);
packed = replaceOnce(packed, '        script.src = src;',
  '        if (entry.inlineJs) { script.textContent = entry.inlineJs; script.dataset.linjiangDirectEntry = directVersion; }\n        else script.src = src;');
// The embedded entry is already an IIFE: execute synchronously, without module scheduling.
// The external ESM entry for other hosts retains type=module and its load event.
packed = replaceOnce(packed, "        script.type = 'module';",
  "        script.type = entry.inlineJs ? 'text/javascript' : 'module';");
// Content readiness, rather than an inline load event, remains authoritative.
packed = replaceOnce(packed, '        document.head.appendChild(script);\n      });',
  `        if (!entry.inlineJs) { document.head.appendChild(script); return; }
        window.__linjiangDirectBootPhase?.('bundle');
        // A dynamically inserted classic script reports runtime errors on window,
        // not by throwing from appendChild. Reject partial mounts instead of hiding the error.
        let inlineError = null;
        const captureInlineError = (event) => { inlineError = event.error || new Error('Inline HUD execution failed'); };
        window.addEventListener('error', captureInlineError);
        try { document.head.appendChild(script); }
        finally { window.removeEventListener('error', captureInlineError); }
        if (inlineError) reject(inlineError);
        else resolve();
      });`);
packed = replaceOnce(packed, '      await waitForNativePaint(6000);',
  '      await waitForNativePaint(6000);\n      if (!entry.inlineJs) window.__linjiangDirectBootPhase?.(\'ready\');\n      if (entry.inlineJs) { updateDirectBadge(true); window.__linjiangDirectBootPhase?.(document.documentElement.dataset.hudIosTtFlat === \'1\' ? \'ready\' : \'renderer-mismatch\'); }');
// Probe the early return paths as well as mounting; these hooks exist only in this test delivery.
for (const [anchor, next] of [
  ["  const SHELL_VERSION =", "  window.__linjiangDirectBootPhase?.('shell');\n  const SHELL_VERSION ="],
  ["  if (!window.frameElement) {", "  if (!window.frameElement) {\n    window.__linjiangDirectBootPhase?.('frame-missing');"],
  ["  if (window[GUARD]) {", "  if (window[GUARD]) {\n    window.__linjiangDirectBootPhase?.('duplicate-shell');"],
  ["  const INLINE_DOCK = INLINE_DOCK_REQUESTED && !MOBILE_NATIVE_FLOW;", "  const INLINE_DOCK = INLINE_DOCK_REQUESTED && !MOBILE_NATIVE_FLOW;\n  window.__linjiangDirectBootPhase?.(MOBILE_NATIVE_FLOW ? 'native-flow' : 'lifted');"],
  ["  const mountMobileNativeHud = () => {", "  const mountMobileNativeHud = () => {\n    window.__linjiangDirectBootPhase?.('mount');"],
  ["      await waitForNativePaint(6000);", "      if (entry.inlineJs) window.__linjiangDirectBootPhase?.('first-content');\n      await waitForNativePaint(6000);"],
]) packed = replaceOnce(packed, anchor, next);
const header = source.match(/<!--[^]*?-->/)?.[0];
if (!header) throw new Error('Missing source shell header');
packed = replaceOnce(packed, header, `<!-- V20260906 TT iOS direct-test delivery: ${version}
     Generated by scripts/build-ios-tt-direct.mjs; edit source, then regenerate.
     TT iOS native flow uses the embedded HUD JS/CSS instead of the Pages entry.
     Other hosts keep the normal loader. Images and auxiliary pages remain online.
     This is a separate diagnostic delivery, not the normal production shell. -->`);
packed = packed.replaceAll('\n', '\r\n');
if (process.argv.includes('--check')) {
  if (readFileSync(outPath, 'utf8') !== packed) throw new Error('Direct-test HTML is stale; run npm run shell:ios-direct');
  console.log(`Direct-test HTML current: ${version}`);
} else {
  writeFileSync(outPath, packed, 'utf8');
  console.log(`Generated ${relative(root, outPath)}\n${version}; ${Buffer.byteLength(packed)} bytes; images/auxiliary pages still online`);
}
