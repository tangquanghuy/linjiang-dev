/* CG 鉴赏覆盖层。
   ------------------------------------------------------------------
   和街机、地图同一个构造，理由也一样：这一页是自带 jQuery / Font Awesome / 自己一整套
   浅色样式的独立页面（cg/index.html，从小手机的 CG 收集原样拆出来的），塞进缩放画布里
   既要重写它的事件也要重写它的版式，而那正是"逻辑跟样式不用大改"要避免的。所以它是一层
   铺满未缩放视口的 iframe，HUD 只负责挂载、关闭，和把好感度喂给它。

   为什么好感度要喂：CG 页跨域（部署后 HUD 在 Pages 上，它也在 Pages 上，同源；但在酒馆里
   HUD 本身已经是跨域 iframe，页面里再摸 MVU 是摸不到的），它原来那份"一路降级去读 Mvu"
   的取数逻辑在这里不成立。HUD 手上已经有整份快照，直接推一份 {角色: {好感度}} 过去，
   形状保持小手机的 羁绊列表 原样，页面那边不用改。 */

import { characterDetails, onLive } from './data.js';
import { hudPage } from './asset.js';
import { mountFrameLoading } from './overlay-loading.js';
import { acquireOverlayHost } from './overlay-host.js';
import { getCGUnlockSnapshot } from './bridge.js';

const CHANNEL = 'linjiang-cg';

export function cgSrc() {
  /* 基准是 HUD 自己的来源，不是 document.baseURI（见 src/asset.js 的 hudBase）。 */
  return hudPage('cg/index.html');
}

let activeCgLayer = null;
export function isCgOpen() {
  return !!activeCgLayer?.isConnected || !!document.querySelector('.cg-layer');
}

export function cgOverlay() {
  return `
<div class="cg-layer" role="dialog" aria-modal="true" aria-label="CG 鉴赏">
  <iframe class="cg-frame" src="${cgSrc()}" title="CG 鉴赏" data-cg-frame></iframe>
  <div class="cg-chrome">
    <button class="cg-close" type="button" data-cg-close aria-label="关闭 CG 鉴赏">×</button>
  </div>
</div>`;
}

/** 对象信息的最小形状：{角色名: {羁绊: {好感度: n}}}，与小手机联系人读取器一致。 */
function contactMap() {
  const out = {};
  Object.entries(characterDetails).forEach(([name, row]) => {
    out[name] = { 羁绊: { 好感度: Math.max(0, Math.round(Number(row?.bond?.favor) || 0)) } };
  });
  return out;
}

export function mountCgOverlay(host, { onClose } = {}) {
  const mount = acquireOverlayHost(host || document.body);
  const root = mount.root;
  root.querySelectorAll('.cg-layer').forEach((el) => el.remove());
  root.insertAdjacentHTML('beforeend', cgOverlay());
  const layer = root.querySelector(':scope > .cg-layer');
  activeCgLayer = layer;
  const eventTarget = layer.ownerDocument?.defaultView || window;
  const iframe = layer.querySelector('[data-cg-frame]');
  layer.querySelector('[data-cg-close]').addEventListener('click', () => onClose?.());
  if (!mount.portal) document.documentElement.classList.add('has-cg');
  /* 同商店/街机：页面从 Pages 取，慢的时候覆盖层就是一片近黑。见 src/overlay-loading.js。 */
  const unmountLoading = mountFrameLoading(layer, iframe, { label: 'CG 鉴赏', onClose: () => onClose?.() });

  const push = () => {
    const contacts = contactMap();
    /* bonds 保留一版兼容字段，避免 Pages 滚动部署期间新旧 cg-shell 短暂交叉。 */
    try {
      iframe.contentWindow?.postMessage({ type: `${CHANNEL}:data`, contacts, bonds: contacts }, '*');
      /* 原生流的 HUD 跑在酒馆 srcdoc origin，而 CG iframe 跑在 Pages origin，二者不再共享
         localStorage。把 HUD 持久化的解锁快照在每次开页时补给 CG，解决“关闭画廊时解锁，
         之后打开却看不到”的 portal 架构回归。 */
      iframe.contentWindow?.postMessage({ type: `${CHANNEL}:sync`, unlocked: getCGUnlockSnapshot() }, '*');
    } catch (_) {}
  };
  const pushUnlock = (event) => {
    const unlock = event?.detail;
    if (!unlock) return;
    try { iframe.contentWindow?.postMessage({ type: `${CHANNEL}:unlock`, unlock }, '*'); }
    catch (_) {}
  };
  const onFrameMsg = (event) => {
    if (event.source !== iframe.contentWindow) return;
    const type = event.data?.type;
    /* 页面开机通报 → 推一份好感度；页面里按了 Esc 或它自己的关闭钮 → 关掉这一层。
       关闭动作留在 HUD 这边做，因为要拆的不只是 iframe（还有壳层那两颗浮层钮的恢复，
       走 pages.js 的 sync → reportOverlay）。 */
    if (type === `${CHANNEL}:hello`) { push(); return; }
    if (type === `${CHANNEL}:close`) onClose?.();
  };
  iframe.addEventListener('load', push);
  eventTarget.addEventListener('message', onFrameMsg);
  addEventListener('linjiang:cg-unlock', pushUnlock);
  const offLive = onLive(push);

  return () => {
    offLive();
    unmountLoading();
    eventTarget.removeEventListener('message', onFrameMsg);
    removeEventListener('linjiang:cg-unlock', pushUnlock);
    layer.remove();
    mount.release();
    if (activeCgLayer === layer) activeCgLayer = null;
    if (!mount.portal && !document.querySelector('.cg-layer')) document.documentElement.classList.remove('has-cg');
  };
}
