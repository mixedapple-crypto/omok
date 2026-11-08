import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const module={exports:{}};
new Function('module',readFileSync(new URL('../www/mul/daily.js',import.meta.url),'utf8'))(module);
const D=module.exports;
let seed=7123;
const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
function day(mode='mixed'){const d=D.create('2026-11-08',mode);D.start(d,random);return d;}
function answer(d,correct){
  const r=D.current(d);
  for(let i=0;i<10;i++){
    assert.equal(D.submit(d,i<correct?r.questions[i].ans:0),true);
    if(i<9){assert.equal(r.score,null);assert.equal(r.graded,false);}
  }
  assert.equal(r.score,correct*10);
}
function review(d){
  const r=D.current(d);
  for(const i of D.wrong(r)){
    for(const step of D.steps(r.questions[i]).slice(r.review[i]||0)){
      assert.equal(D.review(d,i,step.value+1),false);
      assert.equal(D.review(d,i,step.value),true);
    }
  }
}
for(const mode of ['one','two','mixed']){
  for(let n=0;n<100;n++){
    const r=D.current(day(mode)),qs=r.questions;
    assert.equal(qs.length,10);
    assert.equal(new Set(qs.map(q=>q.a+'x'+q.b)).size,10);
    assert.equal(qs.filter(q=>q.b>=10).length,mode==='one'?0:mode==='two'?10:5);
    for(const q of qs){
      assert(q.a>=10&&q.a<=99&&q.b>=2&&q.b<=99);
      assert.equal(q.ans,q.a*q.b);
      const steps=D.steps(q);
      assert.equal(steps.length,3);
      assert.equal(steps[2].value,q.ans);
      assert.equal((q.b<10?steps[0].value*10:steps[0].value)+steps[1].value,q.ans);
    }
  }
}
console.log('PASS: 문제 유형별 범위·10문제 중복 없음·분해 풀이 계산');
{
  const d=day();assert.equal(D.submit(d,''),false);assert.equal(D.submit(d,'1e2'),false);
  assert.equal(D.submit(d,'-1'),false);assert.equal(D.confirm(d,'now'),false);
  answer(d,10);assert.equal(d.passed,true);assert.equal(d.finished,true);
  assert.equal(D.start(d),false);assert.equal(D.submit(d,1),false);
  assert.equal(D.confirm(d,'2026-11-08T12:00:00Z'),true);assert.equal(D.confirm(d,'again'),false);
}
console.log('PASS: 1R 100점 성공·확인 중복 방지·미완료 확인 거절');
for(const first of [0,8,9]){
  const d=day();answer(d,first);
  assert.equal(D.start(d),false);assert.equal(d.finished,false);
  review(d);assert.equal(d.finished,false);assert.equal(D.start(d,random),true);
  answer(d,9);assert.equal(d.finished,false);assert.equal(D.confirm(d,'now'),false);
  review(d);assert.equal(d.finished,true);assert.equal(d.passed,true);assert.equal(D.start(d),false);
}
console.log('PASS: 1R 90점 실패·오답 전부 풀이 후 2R·2R 90점 성공');
for(const last of [0,8,9,10]){
  let d=day('two');answer(d,8);review(d);D.start(d,random);answer(d,8);review(d);
  // 저장/복원 뒤에도 점수와 복습 단계, 라운드 상한이 유지된다.
  d=JSON.parse(JSON.stringify(d));assert.equal(D.start(d,random),true);
  answer(d,last);review(d);
  assert.equal(d.finished,true);assert.equal(d.passed,last>=9);
  assert.equal(D.start(d),false);assert.equal(D.confirm(d,'now'),true);
  assert.equal(d.rounds.length,3);
}
console.log('PASS: 2R 80점 실패·3R 90점 경계·실패해도 추가 재도전 없음');
{
  const d=day();answer(d,9);
  const i=D.wrong(D.current(d))[0],step=D.steps(D.current(d).questions[i])[0];
  D.review(d,i,step.value);
  const copy=JSON.parse(JSON.stringify(d));assert.equal(D.current(copy).review[i],1);
  assert.equal(D.current(copy).score,90);review(copy);
  assert.equal(D.current(copy).score,90);
  const store={[d.date]:d};store['2026-11-09']=day();
  assert.notEqual(store[d.date],store['2026-11-09']);
  assert.equal(D.dateKey(new Date(2026,0,2)),'2026-01-02');
}
console.log('PASS: 풀이 단계 저장·풀이 후 점수 유지·기기 현지 날짜');
const html=readFileSync(new URL('../www/mul/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../www/sw.js',import.meta.url),'utf8');
for(const file of ['daily.js','daily-ui.js']){
  assert(html.includes('src="'+file+'"'));assert(sw.includes("'./mul/"+file+"'"));
}
const doc=readFileSync(new URL('../documents/곱셈-바다-지침서.md',import.meta.url),'utf8');
assert(doc.includes('**10문제**'));assert(doc.includes('**1라운드 100점**'));
assert(doc.includes('**2라운드 90점 이상**'));assert(doc.includes('**3라운드 90점 이상**'));
console.log('PASS: 스크립트·오프라인 캐시·문서 규칙 연결');
