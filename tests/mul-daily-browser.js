// 선택 실행: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/mul-daily-browser.js
// 개발 서버(http://localhost:4173)가 실행 중이어야 한다. 런타임 의존성은 추가하지 않는다.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
mkdirSync('_workspace/screenshots',{recursive:true});
mkdirSync('_workspace/runs',{recursive:true});
const errors=[];
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_BASE_URL||'http://localhost:4173';
const state=()=>page.evaluate(()=>{
  const all=JSON.parse(localStorage.getItem('mul-daily-v1'));
  return all[window.MulDaily.dateKey()];
});
async function type(value){await page.keyboard.type(String(value));}
async function begin(mode){
  await page.goto(base+'/mul/');
  await page.evaluate(()=>localStorage.removeItem('mul-daily-v1'));await page.reload();
  await page.selectOption('#daily-mode',mode);await page.click('#daily-open');
}
async function round(correct){
  const d=await state(),r=d.rounds.at(-1);
  for(let i=r.answers.length;i<10;i++){
    const q=r.questions[i];await type(i<correct?q.ans:String(q.ans).replace(/./g,'0'));
    if(i<9){
      assert.equal(await page.locator('#daily-results').textContent(),'');
      assert(!/\d+점|정답 \d/.test(await page.locator('#daily-progress').textContent()));
    }
  }
  assert((await page.locator('#daily-progress').textContent()).startsWith(correct*10+'점'));
}
async function review(){
  if(!(await page.locator('#daily-review').isVisible()))return;
  await page.click('#daily-review');
  const d=await state(),r=d.rounds.at(-1);
  for(let i=0;i<10;i++){
    if(r.questions[i].ans===r.answers[i])continue;
    const values=await page.evaluate(q=>window.MulDaily.steps(q).map(s=>s.value),r.questions[i]);
    for(const val of values)await type(val);
  }
}
try{
  await begin('mixed');
  const initial=await state();
  // 숫자판·삭제·빈 제출·짧은 답 제출과 새로고침 복원.
  await page.click('[data-daily-key="submit"]');assert.equal((await state()).rounds[0].answers.length,0);
  await page.click('[data-daily-key="1"]');await page.click('[data-daily-key="del"]');
  assert.equal(await page.locator('#daily-answer').textContent(),'?');
  await type(initial.rounds[0].questions[0].ans);await page.reload();await page.click('#daily-open');
  assert.equal((await state()).rounds[0].answers.length,1);
  await page.screenshot({path:'_workspace/screenshots/daily-exam-phone.png',fullPage:true});
  const rect=await page.locator('[data-daily-key="1"]').boundingBox();assert(rect.width>=44&&rect.height>=44);
  await round(10);assert.equal((await state()).finished,true);
  await page.screenshot({path:'_workspace/screenshots/daily-success-phone.png',fullPage:true});
  assert.equal(await page.locator('#daily-next').isVisible(),false);
  await page.click('#daily-home');await page.click('#btn-parent');
  assert.equal(await page.locator('#p-body').isVisible(),false);
  assert(!(await page.locator('#p-body').textContent()).includes('날짜별 부모 확인'));
  await page.fill('#gate-in','0');await page.click('#gate-ok');assert.equal(await page.locator('#p-body').isVisible(),false);
  // 관문 답은 테스트 실행 중 문제로부터 계산하며 안내·증거에 노출하지 않는다.
  await page.fill('#gate-in',String(17*23));await page.click('#gate-ok');
  await page.getByRole('button',{name:'이날 학습 확인하기'}).click();
  assert((await state()).confirmedAt);
  await page.screenshot({path:'_workspace/screenshots/daily-parent-phone.png',fullPage:true});
  await page.reload();assert((await page.locator('#daily-status').textContent()).includes('확인 완료'));
  console.log('PASS: 390×844 숫자판·키보드·새로고침·10문제 후 채점·부모 관문·확인 저장·44px 터치');

  await begin('one');await round(9);assert.equal((await state()).finished,false);
  assert.equal(await page.locator('#daily-next').isVisible(),false);
  await page.click('#daily-review');
  const r=(await state()).rounds[0],i=r.answers.findIndex((a,i)=>a!==r.questions[i].ans);
  await type('0');await page.keyboard.press('Enter');
  assert((await page.locator('#daily-feedback').textContent()).includes('생각'));
  await page.screenshot({path:'_workspace/screenshots/daily-review-phone.png',fullPage:true});
  const steps=await page.evaluate(q=>window.MulDaily.steps(q),r.questions[i]);
  await type(steps[0].value);await page.reload();await page.click('#daily-open');
  assert.equal((await state()).rounds[0].review[i],1);
  await page.click('#daily-review');await type(steps[1].value);await type(steps[2].value);
  await page.click('#daily-next');await round(9);await review();
  assert.equal((await state()).passed,true);assert.equal((await state()).rounds.length,2);
  console.log('PASS: 1R 90점 실패·오답 단계 재입력·풀이 저장·2R 90점 성공');

  for(const last of [8,9]){
    await begin('two');await round(8);await review();await page.click('#daily-next');
    await round(8);await review();await page.click('#daily-next');await round(last);await review();
    const d=await state();assert.equal(d.finished,true);assert.equal(d.passed,last===9);
    assert.equal(await page.locator('#daily-next').isVisible(),false);
    await page.click('#daily-home');await page.click('#daily-open');
    assert.equal((await state()).rounds.length,3);
  }
  console.log('PASS: 두 자리 × 두 자리·3R 80점 종료·3R 90점 성공·당일 추가 시도 차단');

  await page.setViewportSize({width:844,height:390});await page.click('#daily-home');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'_workspace/screenshots/daily-landscape.png',fullPage:true});
  await page.setViewportSize({width:768,height:1024});await page.click('#daily-open');
  await page.screenshot({path:'_workspace/screenshots/daily-tablet.png',fullPage:true});
  await page.clock.install({time:new Date('2026-11-08T23:59:00')});
  await begin('one');await type('0');await page.keyboard.press('Enter');
  await page.clock.setFixedTime(new Date('2026-11-09T00:01:00'));
  await page.click('#daily-home');await page.click('#daily-open');
  assert.equal((await state()).date,'2026-11-09');
  assert.equal((await state()).rounds[0].answers.length,0);
  const dates=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mul-daily-v1'))));
  assert(dates.includes('2026-11-08')&&dates.includes('2026-11-09'));
  console.log('PASS: 가로·태블릿 배치·자정 후 날짜별 새 학습');

  await page.goto(base+'/');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.reload();await context.setOffline(true);await page.goto(base+'/mul/');await page.click('#daily-open');
  assert.equal(await page.locator('#scr-daily').isVisible(),true);
  console.log('PASS: 서비스 워커 캐시에서 오프라인 매일 곱셈 열기');
  assert.deepEqual(errors,[]);console.log('PASS: 브라우저 JavaScript 오류 0건');
}finally{
  writeFileSync('_workspace/runs/L3-console.txt',errors.length?errors.join('\n'):'JavaScript pageerror: 0\n');
  await browser.close();
}
