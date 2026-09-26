import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('dist/index.html', 'utf8');
const bundle = html.match(/src="([^"]+\.js)"/)?.[1];
assert.ok(bundle, 'Web export must contain an entry bundle');
const source = readFileSync(`dist${bundle}`, 'utf8');
const key = 'round:introduction:v1';
async function launch(saved) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(html, {
    url: 'http://localhost:8081',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  Object.assign(dom.window, { TextEncoder, TextDecoder, fetch, AnimationEvent: dom.window.Event });
  if (saved) dom.window.localStorage.setItem(key, saved);
  assert.equal(dom.window.Buffer, undefined);
  dom.window.eval(source);
  const text = () => dom.window.document.body.textContent || '';
  const wait = async (condition) => {
    for (let i = 0; i < 80; i++) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (const el of dom.window.document.querySelectorAll('div')) {
        if (dom.window.getComputedStyle(el).animationDuration)
          el.dispatchEvent(new dom.window.Event('animationend', { bubbles: true }));
      }
    }
    assert.fail('Screen did not reach the expected state: ' + text().slice(-1000));
  };
  const click = (label) => {
    const button = [...dom.window.document.querySelectorAll('[role="button"],button')].find(
      (el) => el.getAttribute('aria-label') === label || el.textContent.includes(label),
    );
    assert.ok(button, 'Missing button: ' + label);
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  return { dom, errors, text, wait, click };
}
const first = await launch();
let saved;
try {
  await first.wait(() => first.text().includes('Big goals.'));
  assert.ok(!first.text().includes('Your rounds'), 'First launch opens the introduction');
  first.click('Next');
  await first.wait(() => first.text().includes('Closer tomorrow.'));
  first.click('Back');
  await first.wait(() => first.text().includes('Big goals.'));
  first.click('Next');
  await first.wait(() => first.text().includes('Closer tomorrow.'));
  first.click('Next');
  await first.wait(() => first.text().includes('Your finish line.'));
  first.click('Let’s get started');
  await first.wait(() => first.text().includes('Your rounds'));
  saved = first.dom.window.localStorage.getItem(key);
  assert.equal(saved, 'done');
  assert.ok(first.text().includes(process.env.EXPO_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' ? 'Solana mainnet · Real USDC and SKR' : 'Test tokens have no monetary value'));
  assert.ok(first.text().includes('Connect wallet'));
  assert.ok(!/demo|The laptop fund|Advance.*clock/i.test(first.text()));
  first.click('How ROUND works');
  await first.wait(() => first.text().includes('Big goals.'));
  first.click('Skip introduction');
  await first.wait(() => !first.text().includes('Big goals.'));
  assert.ok(first.text().includes('Your rounds'));
  assert.deepEqual(first.errors, []);
} finally {
  first.dom.window.close();
}
const returning = await launch(saved);
try {
  await returning.wait(() => returning.text().includes('Your rounds'));
  assert.ok(!returning.text().includes('Big goals.'));
  assert.ok(returning.text().includes('How ROUND works'));
  assert.deepEqual(returning.errors, []);
} finally {
  returning.dom.window.close();
}
const skipped = await launch();
try {
  await skipped.wait(() => skipped.text().includes('Big goals.'));
  skipped.click('Skip introduction');
  await skipped.wait(() => skipped.text().includes('Your rounds'));
  assert.equal(skipped.dom.window.localStorage.getItem(key), 'done');
  assert.deepEqual(skipped.errors, []);
} finally {
  skipped.dom.window.close();
}
console.log(
  'PASS: first launch, Next/Back, completion, Skip, saved preference, Home replay, and returning-user dashboard.',
);
