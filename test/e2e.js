// End-to-end check of a fresh Formbricks deploy from the Railway template: admin sign-up, org,
// survey from template, activation, anonymous response via public link, response count,
// logo upload to the bucket, and sign-up closed afterwards.
// usage: npm i playwright-core@1.57 && node test/e2e.js <base-url>   (admin password read from ./.pw)
const { chromium } = require('playwright-core');
const fs = require('fs');
const base = process.argv[2];
const pw = fs.readFileSync('.pw', 'utf8').trim();
const exe = process.env.CHROMIUM_PATH || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell';
const ok = (m) => console.log('PASS', m);
const settle = async (p, ms = 5000) => { await p.waitForTimeout(ms); await p.waitForLoadState('networkidle').catch(() => {}); };

(async () => {
  const b = await chromium.launch({ executablePath: exe });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const fail = async (m) => { console.log('FAIL', m, p.url()); await p.screenshot({ path: 'e2e-fail.png' }); await b.close(); process.exit(1); };

  await p.goto(base + '/', { waitUntil: 'networkidle' });
  if (!/\/setup\/intro/.test(p.url())) await fail('fresh instance did not open /setup/intro');
  ok('fresh instance opens the setup wizard');
  await p.getByText('Get started').click(); await settle(p, 2000);
  await p.getByText('Continue with Email').click(); await p.waitForTimeout(800);
  await p.fill('input[name=name]', 'Template Admin');
  await p.fill('input[type=email]', 'admin@example.com');
  await p.fill('input[type=password]', pw);
  await p.locator('button[type=submit]').first().click(); await settle(p, 6000);
  if (!/signup-without-verification-success/.test(p.url())) await fail('admin sign-up');
  ok('admin account created without email verification');

  await p.goto(base + '/auth/login', { waitUntil: 'networkidle' });
  await p.getByText('Log in with Email').first().click(); await p.waitForTimeout(800);
  await p.fill('input[type=email]', 'admin@example.com');
  await p.fill('input[type=password]', pw);
  await p.locator('button[type=submit]').first().click(); await settle(p, 6000);
  if (!/organization\/create/.test(p.url())) await fail('login / org create page');
  ok('login works');
  await p.fill('input[name=name]', 'Template Test Org');
  await p.locator('button[type=submit]').first().click(); await settle(p, 6000);
  await p.getByRole('button', { name: 'Skip' }).click(); await settle(p, 6000);
  await p.getByRole('button', { name: /Use a template/ }).click(); await settle(p, 4000);
  await p.getByRole('button', { name: /5-Star Rating/ }).click(); await settle(p, 8000);
  const m = p.url().match(/workspaces\/([^/]+)\/surveys\/([^/]+)\/edit/);
  if (!m) await fail('survey created from template');
  const [, ws, survey] = m;
  ok('organization, workspace and survey created');
  await p.goto(`${base}/workspaces/${ws}/surveys/${survey}/edit`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Activate' }).click(); await settle(p, 8000);
  if (!/summary/.test(p.url())) await fail('survey activation');
  ok('survey activated');

  // anonymous respondent
  const anon = await (await b.newContext()).newPage();
  await anon.goto(`${base}/s/${survey}`, { waitUntil: 'networkidle' });
  await anon.locator('label:has(input[type=radio]), input[type=radio]').nth(3).click({ force: true });
  await anon.waitForTimeout(1000);
  await anon.getByRole('button', { name: /Next/ }).first().click(); await anon.waitForTimeout(2000);
  await anon.locator('textarea, input[type=text]').first().fill('Railway template test response');
  await anon.getByRole('button', { name: /Finish|Submit/ }).first().click(); await anon.waitForTimeout(4000);
  if (!/Thank you/.test(await anon.innerText('body'))) await fail('anonymous response via public link');
  ok('anonymous response submitted via /s/<id>');

  await p.goto(`${base}/workspaces/${ws}/surveys/${survey}/summary`, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
  const body = (await p.innerText('body')).replace(/\n+/g, ' | ');
  const resp = body.match(/Responses \| Impressions \| ([^|]+)\|/);
  console.log('summary responses:', resp && resp[1].trim());
  if (!resp || resp[1].trim() !== '1') await fail('response count in summary');
  ok('summary shows 1 response');

  fs.writeFileSync('logo.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  let uploaded = 0;
  p.on('response', (r) => { if (/storageapi\.dev/.test(r.url()) && r.request().method() === 'POST') uploaded = r.status(); });
  await p.goto(`${base}/workspaces/${ws}/settings/workspace/look`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await p.locator('input[type=file]').first().setInputFiles('logo.png'); await p.waitForTimeout(8000);
  console.log('bucket upload status:', uploaded);
  if (uploaded !== 201 && uploaded !== 204) await fail('logo upload to bucket');
  ok('logo upload to the Railway bucket');

  const strangers = await (await b.newContext()).newPage();
  const closed = [];
  for (const path of ['/auth/signup', '/setup/intro']) {
    await strangers.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    closed.push(/Page not found/.test(await strangers.innerText('body')));
  }
  console.log('stranger pages show "Page not found":', closed.join(', '));
  if (closed.includes(false)) await fail('sign-up closed after first admin');
  ok('sign-up and setup closed to strangers');
  console.log('SURVEY', ws, survey);
  await b.close();
})().catch((e) => { console.error('ERROR', e.message.split('\n')[0]); process.exit(1); });
