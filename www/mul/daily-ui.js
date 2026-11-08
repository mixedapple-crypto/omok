/* 기존 게임과 독립된 일일 시험 저장. 부모 화면은 기존 관문을 통과한 뒤에만 그린다. */
(function(){
  'use strict';
  var D=window.MulDaily, KEY='mul-daily-v1', records={}, active=null, input='', reviewing=false, hooks;
  var $=function(id){return document.getElementById(id);};
  function read(){
    try{var data=JSON.parse(localStorage.getItem(KEY)||'{}');if(data&&typeof data==='object'&&!Array.isArray(data))records=data;}catch(e){}
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(records));$('daily-storage').textContent='';}
    catch(e){$('daily-storage').textContent='기록을 저장하지 못했어요. 이 화면을 닫기 전에 부모님께 알려 주세요.';}
  }
  function refresh(){
    read();
    var day=records[D.dateKey()];
    $('daily-status').textContent=!day?'오늘의 10문제를 풀어 보자!':day.finished?
      (day.confirmedAt?'✅ 오늘 학습 · 부모님 확인 완료':'📋 오늘 학습 끝! 부모님께 확인받자'):
      (day.rounds.length+'라운드 이어서 풀기');
    $('daily-open').textContent=day&&day.finished?'오늘 결과 보기':'매일 곱셈 풀기 ➜';
    $('daily-mode').disabled=!!day;
    if(day)$('daily-mode').value=day.mode;
  }
  function open(){
    hooks.stop();read();
    var date=D.dateKey();
    active=records[date];
    if(!active){active=D.create(date,$('daily-mode').value);records[date]=active;D.start(active);save();}
    input='';reviewing=false;render();hooks.show('scr-daily');
  }
  function showEntry(visible){$('daily-entry').hidden=!visible;$('daily-pad').hidden=!visible;}
  function render(){
    var r=D.current(active), n=active.rounds.length;
    $('daily-heading').textContent=active.date+' · '+n+'라운드';
    $('daily-feedback').textContent='';
    $('daily-next').hidden=true;$('daily-review').hidden=true;$('daily-results').textContent='';
    if(!r.graded){
      showEntry(true);
      $('daily-progress').textContent=(r.answers.length+1)+' / 10문제 · 10문제를 모두 풀면 채점해요';
      $('daily-help').textContent='암산해서 답을 한 번에 넣자. 자릿수가 차면 제출돼요. 짧은 답은 제출을 눌러요.';
      problem(r.questions[r.answers.length]);return;
    }
    $('daily-progress').textContent=r.score+'점 · 통과 기준 '+D.TARGETS[n-1]+'점';
    if(reviewing&&!D.reviewDone(r)){
      showEntry(true);
      var i=D.wrong(r).find(function(index){return (r.review[index]||0)<D.steps(r.questions[index]).length;});
      var step=r.review[i]||0;
      $('daily-help').textContent='오답 '+(i+1)+'번 · '+(step+1)+' / 3단계 · '+D.steps(r.questions[i])[step].label;
      problem(r.questions[i]);return;
    }
    showEntry(false);$('daily-problem').textContent='';
    r.questions.forEach(function(q,i){
      var row=document.createElement('div'),correct=q.ans===r.answers[i];
      row.className='daily-result';
      row.textContent=(correct?'○ ':'△ ')+(i+1)+'. '+q.a+' × '+q.b+' = '+r.answers[i]+(correct?'':' · 정답 '+q.ans);
      $('daily-results').appendChild(row);
    });
    if(!D.reviewDone(r)){
      $('daily-help').textContent='틀린 '+D.wrong(r).length+'문제를 차근차근 다시 풀어 보자. 풀이를 마치면 오늘의 결과를 정해요.';
      $('daily-review').hidden=false;
    }else if(active.finished){
      $('daily-help').textContent=(active.passed?'🎉 성공!':'오늘은 여기까지! 3라운드까지 수고했어. 내일 다시 해 보자.')+
        (active.confirmedAt?' 부모님 확인 완료 ✅':' 부모님 화면에서 오늘 학습을 확인받자.');
    }else{
      $('daily-help').textContent='오답 풀이 완료! 새 문제 10개로 '+(n+1)+'라운드에 도전하자.';
      $('daily-next').hidden=false;
      $('daily-next').textContent=(n+1)+'라운드 시작 · 통과 기준 90점';
    }
  }
  function problem(q){
    // 기존 암산 보스처럼 세로로 보여 주고 답 전체를 받는다. 시험 중에는 올림·부분곱을 보이지 않는다.
    $('daily-problem').textContent=q.a+'\n× '+q.b+'\n────';
    $('daily-answer').textContent=input||'?';
  }
  function expected(){
    var r=D.current(active);
    if(!r.graded)return r.questions[r.answers.length].ans;
    var i=D.wrong(r).find(function(index){return (r.review[index]||0)<D.steps(r.questions[index]).length;});
    return D.steps(r.questions[i])[r.review[i]||0].value;
  }
  function send(){
    if(!input)return;
    var r=D.current(active);
    if(!r.graded){D.submit(active,input);input='';save();render();}
    else if(reviewing){
      var i=D.wrong(r).find(function(index){return (r.review[index]||0)<D.steps(r.questions[index]).length;});
      var accepted=D.review(active,i,input);input='';save();render();
      if(!accepted)$('daily-feedback').textContent='조금만 더 생각해 보자. 위의 작은 계산부터 해 보세요.';
    }
  }
  function key(k){
    if(!active||!$('scr-daily').classList.contains('active')||$('daily-entry').hidden)return;
    if(k==='del')input=input.slice(0,-1);
    else if(k==='submit'){send();return;}
    else if(/^\d$/.test(k)&&input.length<4)input+=k;
    $('daily-answer').textContent=input||'?';
    if(k!=='del'&&input.length===String(expected()).length)send();
  }
  function parent(container){
    read();
    var panel=document.createElement('section'),title=document.createElement('h3');
    title.textContent='📅 매일 곱셈 · 날짜별 부모 확인';panel.appendChild(title);
    var dates=Object.keys(records).sort().reverse();
    if(!dates.length){var empty=document.createElement('p');empty.textContent='아직 매일 곱셈 기록이 없어요.';panel.appendChild(empty);}
    dates.forEach(function(date){
      var day=records[date],row=document.createElement('div'),label=document.createElement('p');
      row.className='daily-result';
      label.textContent=date+' · '+({'one':'두 자리 × 한 자리','two':'두 자리 × 두 자리','mixed':'두 유형 섞기'}[day.mode])+' · '+
        day.rounds.map(function(r,i){return (i+1)+'R '+(r.graded?r.score+'점':r.answers.length+'/10문제');}).join(' → ')+
        (day.finished?(day.passed?' · 성공':' · 3라운드 종료'):' · 학습 중');
      row.appendChild(label);
      if(day.confirmedAt){var stamp=document.createElement('p');stamp.textContent='✅ 부모님 확인: '+new Date(day.confirmedAt).toLocaleString('ko-KR');row.appendChild(stamp);}
      else if(day.finished){
        var button=document.createElement('button');button.className='x';button.textContent='이날 학습 확인하기';
        button.addEventListener('click',function(){
          if(D.confirm(day,new Date().toISOString())){save();container.removeChild(panel);parent(container);refresh();}
        });row.appendChild(button);
      }
      panel.appendChild(row);
    });
    container.prepend(panel);
  }
  window.MulDailyUI={refresh:refresh,parent:parent,init:function(options){
    hooks=options;refresh();
    $('daily-open').addEventListener('click',open);
    $('daily-home').addEventListener('click',function(){active=null;hooks.home();hooks.show('scr-home');});
    $('daily-next').addEventListener('click',function(){if(D.start(active)){input='';reviewing=false;save();render();}});
    $('daily-review').addEventListener('click',function(){reviewing=true;input='';render();});
    $('daily-pad').addEventListener('click',function(e){var k=e.target.getAttribute('data-daily-key');if(k)key(k);});
    document.addEventListener('keydown',function(e){
      if(!$('scr-daily').classList.contains('active')||e.target.tagName==='SELECT')return;
      if(/^\d$/.test(e.key)||e.key==='Backspace'||e.key==='Enter'){
        e.preventDefault();if(!e.repeat)key(e.key==='Backspace'?'del':e.key==='Enter'?'submit':e.key);
      }
    });
    document.addEventListener('visibilitychange',function(){if(!document.hidden&&!active)refresh();});
  }};
})();
