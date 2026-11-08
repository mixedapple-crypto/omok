/* 매일 곱셈: DOM과 저장소에 의존하지 않는 시험·오답 풀이 규칙. */
(function(root){
  'use strict';
  var COUNT=10, TARGETS=[100,90,90];
  function dateKey(date){
    var d=date||new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function questions(mode,random){
    var rng=random||Math.random, list=[], seen={};
    function ri(lo,hi){return lo+Math.floor(rng()*(hi-lo+1));}
    while(list.length<COUNT){
      var wide=mode==='two'||(mode==='mixed'&&list.length>=5);
      var a=ri(10,99), b=wide?ri(10,99):ri(2,9), key=a+'x'+b;
      if(seen[key])continue;
      seen[key]=true;list.push({a:a,b:b,ans:a*b});
    }
    // 섞기에서도 두 유형을 정확히 다섯 문제씩 낸다.
    for(var i=list.length-1;i>0;i--){var j=ri(0,i),tmp=list[i];list[i]=list[j];list[j]=tmp;}
    return list;
  }
  function create(date,mode){
    return {date:date,mode:mode,rounds:[],finished:false,passed:false,confirmedAt:null};
  }
  function current(day){return day.rounds[day.rounds.length-1];}
  function start(day,random){
    var prev=current(day);
    if(day.finished||day.rounds.length>=3||(prev&&(!prev.graded||!reviewDone(prev))))return false;
    day.rounds.push({questions:questions(day.mode,random),answers:[],parts:{},pending:[],stepOrder:'ones-first',graded:false,score:null,review:{}});
    return true;
  }
  function submit(day,value){
    var r=current(day);
    if(!r||r.graded||day.finished||!/^\d{1,4}$/.test(String(value)))return false;
    var q=r.questions[r.answers.length];
    if(q.b>=10){
      if(!r.parts)r.parts={};if(!r.pending)r.pending=[];
      r.pending.push(Number(value));
      if(r.pending.length<3)return true;
      r.parts[r.answers.length]=r.pending;r.pending=[];
    }
    r.answers.push(Number(value));
    if(r.answers.length===COUNT){
      r.graded=true;
      r.score=r.questions.reduce(function(sum,q,i){return sum+(correct(r,i)?10:0);},0);
      settle(day);
    }
    return true;
  }
  function correct(r,i){
    var q=r.questions[i],parts=r.parts&&r.parts[i];
    return r.answers[i]===q.ans&&(!parts||steps(q).every(function(st,k){return parts[k]===st.value;}));
  }
  function wrong(r){return r.questions.map(function(q,i){return i;}).filter(function(i){return !correct(r,i);});}
  function steps(q){
    var tens=Math.floor(q.a/10),ones=q.a%10;
    if(q.b<10)return [
      {label:'십의 자리부터: '+tens+' × '+q.b+' (끝의 0은 빼고)',value:tens*q.b},
      {label:'일의 자리: '+ones+' × '+q.b,value:ones*q.b},
      {label:'두 값을 자리 맞춰 더하기: '+(tens*q.b*10)+' + '+(ones*q.b),value:q.ans}
    ];
    var bt=Math.floor(q.b/10),bu=q.b%10;
    return [
      {label:'먼저 일의 자리: '+q.a+' × '+bu,value:q.a*bu},
      {label:'다음 십의 자리: '+q.a+' × '+bt+' (끝의 0은 빼고)',value:q.a*bt},
      {label:'두 곱을 자리 맞춰 더하기: '+(q.a*bu)+' + '+(q.a*bt*10),value:q.ans}
    ];
  }
  function reviewDone(r){return wrong(r).every(function(i){return (r.review[i]||0)>=steps(r.questions[i]).length;});}
  function settle(day){
    var r=current(day);
    if(!r||!r.graded||!reviewDone(r))return;
    day.passed=r.score>=TARGETS[day.rounds.length-1];
    day.finished=day.passed||day.rounds.length===3;
  }
  function review(day,index,value){
    var r=current(day);
    if(!r||!r.graded||day.finished||wrong(r).indexOf(index)<0)return false;
    var st=steps(r.questions[index])[r.review[index]||0];
    if(!st||!/^\d+$/.test(String(value))||Number(value)!==st.value)return false;
    r.review[index]=(r.review[index]||0)+1;settle(day);return true;
  }
  function confirm(day,at){
    if(!day.finished||day.confirmedAt)return false;
    day.confirmedAt=at;return true;
  }
  var api={COUNT:COUNT,TARGETS:TARGETS,dateKey:dateKey,create:create,start:start,current:current,
    submit:submit,correct:correct,wrong:wrong,steps:steps,reviewDone:reviewDone,review:review,confirm:confirm};
  if(typeof module!=='undefined')module.exports=api;
  else root.MulDaily=api;
})(typeof window!=='undefined'?window:globalThis);
