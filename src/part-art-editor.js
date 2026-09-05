import { partArtOverride } from './data.js';
import { requestCharacterPartArtSave } from './bridge.js';

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[char]));

export function partArtEditor(girl, key) {
  if (!girl?.custom) return '';
  const value = partArtOverride(girl.name, key);
  return `
    <form class="part-art-editor" data-part-art-form data-name="${esc(girl.name)}" data-part="${esc(key)}">
      <label>部位图片网络链接</label>
      <div><input type="url" name="url" value="${esc(value)}" placeholder="https://example.com/image.webp" inputmode="url">
      <button type="submit">保存</button></div>
      <small>仅保存 http(s) 图片链接到 MVU 系统配置；留空保存可清除。</small>
      <output aria-live="polite"></output>
    </form>`;
}

function paintPartArt(root, name, key, url) {
  root.querySelectorAll('[data-part-art-name][data-part-art-key]').forEach((crop) => {
    if (crop.dataset.partArtName !== name || crop.dataset.partArtKey !== key) return;
    let image = crop.querySelector('img');
    if (!url) { image?.remove(); return; }
    if (!image) {
      image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.setAttribute('data-remove-on-error', '');
      crop.prepend(image);
    }
    image.src = url;
  });
}

export async function handlePartArtSubmit(form, root = document) {
  const name = String(form?.dataset?.name || '').trim();
  const part = String(form?.dataset?.part || '').trim();
  const input = form?.elements?.url;
  const output = form?.querySelector('output');
  const button = form?.querySelector('button[type="submit"]');
  const url = String(input?.value || '').trim();
  if (!name || !part) return false;
  if (url && !/^https?:\/\//i.test(url)) {
    if (output) output.textContent = '请输入 http(s) 网络链接';
    input?.focus();
    return false;
  }
  if (button) button.disabled = true;
  if (output) output.textContent = '保存中…';
  try {
    const result = await requestCharacterPartArtSave({ name, part, url });
    const saved = String(result?.url ?? url).trim();
    if (input) input.value = saved;
    paintPartArt(root, name, part, saved);
    if (output) output.textContent = saved ? '已保存到 MVU' : '已清除';
    return true;
  } catch (error) {
    console.error('[part-art]', error);
    if (output) output.textContent = error?.message || '保存失败';
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}
