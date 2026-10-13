'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const path = require('node:path');
function normalizeRuntimeStderr(stderr) {
  return stderr.replace(/^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\r?\n(?:\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\r?\n)?/gm, '');
}
test('listener warning filter removes only the exact SQLite warning and adjacent hint',()=>{
  const warning='(node:123) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n';
  const hint='(Use `node --trace-warnings ...` to show where the warning was created)\n';
  assert.equal(normalizeRuntimeStderr(warning+hint+'PinID listener failed.\n'),'PinID listener failed.\n');
  assert.equal(normalizeRuntimeStderr((warning+hint).replaceAll('\n','\r\n')),'');
  for(const unexpected of [hint,'(node:123) ExperimentalWarning: Unknown feature\n'+hint,'Error: private unexpected error\n',warning.replace('SQLite','Other')]) {
    assert.equal(normalizeRuntimeStderr(unexpected),unexpected);
  }
});
function start(host,port) {
  const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),
    env:{...process.env,PINID_LITE_ENABLED:'false',PINID_HOST:host,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let output='';let errors='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>errors+=x);
  return {child,result:async()=>{const [code]=await once(child,'exit');return {code,output,errors};}};
}
test('invalid listener host exits safely without success or stack disclosure',async()=>{
  const run=start('invalid hostname',0);const result=await run.result();
  assert.equal(result.code,1);assert.equal(result.output,'');assert.equal(normalizeRuntimeStderr(result.errors),'PinID listener failed.\n');
});
test('occupied port exits safely without null-address crash',async()=>{
  const occupied=http.createServer();occupied.listen(0,'127.0.0.1');await once(occupied,'listening');
  try {const result=await start('127.0.0.1',occupied.address().port).result();
    assert.equal(result.code,1);assert.equal(result.output,'');assert.equal(normalizeRuntimeStderr(result.errors),'PinID listener failed.\n');
  }finally{await new Promise(resolve=>occupied.close(resolve));}
});
test('real standalone server reports bound port and serves fail-closed response',async()=>{
  const run=start('127.0.0.1',0);let output='';
  try {
    const bound=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Server readiness timeout')),10000);
      run.child.once('error',reject);
      run.child.stdout.on('data',data=>{output+=data;const match=output.match(/127\.0\.0\.1:(\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
    });
    const response=await fetch(`http://127.0.0.1:${bound}/healthz`);assert.equal(response.status,503);
    assert.equal((await response.json()).error.code,'PINID_DISABLED');
  }finally{run.child.kill();await once(run.child,'exit');}
});
