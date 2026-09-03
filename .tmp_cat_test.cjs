const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('D:/Code/glass-hud/参考/自动行内补全交互包装脚本.js', 'utf8');
const listeners = {};
const ctx = {
  chat: [
    { is_user: false, mes: 'GREETING_HISTORY' },
    { is_user: true, mes: 'LATEST_REAL_INPUT' },
  ],
  eventTypes: { GENERATE_AFTER_DATA: 'GENERATE_AFTER_DATA' },
  eventSource: {
    events: listeners,
    on(event, fn) { (listeners[event] ||= []).push(fn); },
    makeLast(event, fn) { (listeners[event] ||= []).push(fn); },
    removeListener() {},
    emit() {},
  },
};
const win = {
  fetch: async () => ({}),
  addEventListener() {},
  removeEventListener() {},
  SPresetImports: {
    promptManager: {
      messages: {
        collection: [{
          identifier: 'chatHistory',
          getChat() {
            return [
              { role: 'assistant', content: 'GREETING_HISTORY' },
              { role: 'user', content: 'LATEST_REAL_INPUT' },
            ];
          },
        }],
      },
    },
  },
};
win.window = win; win.parent = win; win.top = win; win.InlineWrap = null;
const sandbox = {
  window: win,
  globalThis: win,
  SillyTavern: { getContext: () => ctx },
  console,
  URL,
  Request,
  fetch: win.fetch,
  setTimeout,
  clearTimeout,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const prompt = [
  { role: 'system', content: 'SYS\n[Player Role]\n玩家：User\n\n|用户：User|\n|用户|喵喵喵——伟大又可爱的小猫之神，请聆听您的信徒最虔诚的呼唤——小猫之神——\n|小猫之神|好耶喵！那我们开始了——' },
  { role: 'user', content: '[Start a new chat]' },
  { role: 'assistant', content: '[Player Role]\n玩家：User\n\nOLD_SQUASHED_BLOB' },
  { role: 'user', content: 'LATEST_REAL_INPUT\n\n[创作细则]\nRULES' },
];
const out = win.InlineWrap.preview(prompt);
console.log(JSON.stringify(out, null, 2));
console.log('\nTAIL=', out.at(-1));
console.log('\nTERMINAL=', out.find(x => x.role === 'assistant' && String(x.content).includes('GREETING_HISTORY'))?.content);
console.log('\nSYSTEM=', out[0].content);
