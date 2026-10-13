'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');
const {spawn}=require('node:child_process');const path=require('node:path');
const {postgresConfig}=require('../src/postgres-config');const {PostgresRepository,migrate,parameters}=require('../src/postgres-repository');
const {Service}=require('../src/postgres-service');const {createApp,createAppAsync}=require('../src/app');const s=require('../src/security');
test('PostgreSQL configuration is explicit and does not weaken TLS implicitly',()=>{
  const env={PINID_DATABASE_URL:'postgresql://tester@localhost/pinid_test',PINID_DB_POOL_MAX:'5',PINID_DB_CONNECTION_TIMEOUT_MS:'5000'};
  assert.equal(postgresConfig(env).ssl.rejectUnauthorized,true);assert.equal(postgresConfig(env).max,5);
  for(const change of [{PINID_DB_SCHEMA:'public'},{PINID_STORAGE_VERSION:'unknown'},{PINID_DB_POOL_MAX:'0'},{PINID_PG_TLS:'prefer'},{PINID_DATABASE_URL:env.PINID_DATABASE_URL+'?sslmode=disable'}])assert.throws(()=>postgresConfig({...env,...change}));
  assert.equal(parameters("SELECT '?' AS literal, ? AS input"),"SELECT '?' AS literal, $1 AS input");
});
const url=process.env.PINID_TEST_DATABASE_URL;
test('PostgreSQL persistence and private API contract', {skip:!url}, async t=>{
  const parsed=new URL(url);
  assert.ok(['127.0.0.1','localhost'].includes(parsed.hostname));assert.ok(parsed.pathname.endsWith('_test'));
  assert.equal(process.env.PINID_PG_TEST_ALLOW_RESET,'true','Explicit disposable database reset permission required');
  const pg=postgresConfig({PINID_DATABASE_URL:url,PINID_PG_TLS:'disable'});const admin=new PostgresRepository(pg);
  await admin.query('DROP SCHEMA IF EXISTS pinid CASCADE');
  const autoConfig={backend:'postgres',postgres:pg,migration:pg,autoMigrate:true,origin:'https://pinid.test',secure:true,
    encryptionKey:Buffer.from(s.token(),'base64url'),sessionSecret:s.token(),adminSecret:s.token(),sessionSeconds:3600};
  await t.test('startup auto-migrates clean database concurrently and repeat startup preserves data',async()=>{
    const apps=await Promise.all([createAppAsync(autoConfig),createAppAsync(autoConfig)]);
    try{const invitation=await apps[0].locals.pinid.invite();assert.ok(invitation.invitation);}
    finally{await Promise.all(apps.map(app=>app.locals.pinid.close()));}
    const before=await admin.get('SELECT count(*) AS count FROM invitations');
    const repeated=await createAppAsync(autoConfig);await repeated.locals.pinid.close();
    assert.equal((await admin.get('SELECT count(*) AS count FROM invitations')).count,before.count);
  });
  await migrate(pg);
  // The migration role owns objects; actual application tests use only DML privileges.
  await admin.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='pinid_runtime_test') THEN CREATE ROLE pinid_runtime_test LOGIN PASSWORD 'disposable-test-only'; END IF; END $$");
  await admin.query('GRANT USAGE ON SCHEMA pinid TO pinid_runtime_test');
  await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA pinid TO pinid_runtime_test');
  await admin.query('REVOKE INSERT,UPDATE,DELETE ON pinid.schema_migrations FROM pinid_runtime_test');
  const runtime=new URL(url);runtime.username='pinid_runtime_test';runtime.password='disposable-test-only';
  const runtimePg=postgresConfig({PINID_DATABASE_URL:runtime.toString(),PINID_PG_TLS:'disable'});
  let now=Date.now();const config={backend:'postgres',postgres:runtimePg,origin:'https://pinid.test',secure:true,
    encryptionKey:autoConfig.encryptionKey,sessionSecret:s.token(),adminSecret:s.token(),sessionSeconds:3600};
  let service=await Service.create(config,()=>now);const app=createApp(config,service);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const input=(invite,name)=>({invitation:invite,username:name,location:{latitude:12.972579,longitude:77.592015,confirmed:true,label:'Private synthetic home'}});
  let first,second;
  const request=async(route,method='GET',body,cookie,csrf)=>{
    const headers={Origin:config.origin,'Content-Type':'application/json'};if(cookie)headers.Cookie=cookie;if(csrf)headers['X-PinID-CSRF']=csrf;
    return fetch(base+route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  };
  try {
    await t.test('migration repeat/checksum and least-privilege runtime',async()=>{
      await service.repo.verify();await assert.rejects(()=>service.repo.query('CREATE TABLE pinid.not_allowed(id integer)'));
      await admin.run("UPDATE schema_migrations SET checksum='tampered' WHERE version=1");
      await assert.rejects(()=>service.repo.verify());await assert.rejects(()=>migrate(pg));
      await assert.rejects(()=>createAppAsync(autoConfig));
      const fs=require('node:fs');const sql=fs.readFileSync(path.join(__dirname,'../migrations/postgres/001_initial.sql'),'utf8').replace(/\r\n/g,'\n');
      await admin.run('UPDATE schema_migrations SET checksum=? WHERE version=1',s.hash(sql));await migrate(pg);
    });
    await t.test('concurrent replay and unique 38-character alias are transactional',async()=>{
      const invitation=(await service.invite()).invitation;const username='a'.repeat(30);
      const outcomes=await Promise.allSettled([service.enroll(input(invitation,username)),service.enroll(input(invitation,username))]);
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);first=outcomes.find(x=>x.status==='fulfilled').value;
      assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'ENROLLMENT_FAILED');assert.equal(first.profile.alias.length,38);
      const inv2=(await service.invite()).invitation;await assert.rejects(()=>service.enroll(input(inv2,username)),{code:'ENROLLMENT_FAILED'});
      second=await service.enroll(input(inv2,'second-owner'));
      const sameAlias=await Promise.allSettled([service.enroll(input((await service.invite()).invitation,'race-owner')),service.enroll(input((await service.invite()).invitation,'race-owner'))]);
      assert.equal(sameAlias.filter(x=>x.status==='fulfilled').length,1);
      const expired=(await service.invite(60)).invitation;now+=60001;await assert.rejects(()=>service.enroll(input(expired,'expired-owner')),{code:'ENROLLMENT_FAILED'});
    });
    await t.test('asynchronous HTTP admin enrollment recovery logout and deletion contract',async()=>{
      const headers={Origin:config.origin,'Content-Type':'application/json','X-PinID-Admin':config.adminSecret};
      const invitationResponse=await fetch(base+'/api/invitations',{method:'POST',headers,body:'{}'});
      assert.equal(invitationResponse.status,201);const invitation=(await invitationResponse.json()).invitation;
      const enrollment=await request('/api/enroll','POST',input(invitation,'http-owner'));assert.equal(enrollment.status,201);
      const result=await enrollment.json();const cookie=enrollment.headers.get('set-cookie').split(';')[0];
      assert.match(enrollment.headers.get('set-cookie'),/Secure/);assert.match(enrollment.headers.get('set-cookie'),/HttpOnly/);
      assert.equal((await request('/api/logout','POST',{},cookie)).status,403);
      assert.equal((await request('/api/logout','POST',{},cookie,result.csrf)).status,204);
      assert.equal((await request('/api/me','GET',undefined,cookie)).status,401);
      const recovery=await request('/api/recover','POST',{credential:result.recovery_credential});assert.equal(recovery.status,200);
      const recovered=await recovery.json();const recoveredCookie=recovery.headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/me/export','GET',undefined,recoveredCookie)).status,200);
      assert.equal((await request('/api/me','DELETE',{credential:result.recovery_credential},recoveredCookie,recovered.csrf)).status,204);
      assert.equal((await request('/api/recover','POST',{credential:result.recovery_credential})).status,401);
    });
    await t.test('partial enrollment failure rolls back user location session invite and audit',async()=>{
      const invitation=(await service.invite()).invitation;const audit=service.audit;service.audit=async()=>{throw new Error('Injected partial failure');};
      try{await assert.rejects(()=>service.enroll(input(invitation,'rollback-owner')));}finally{service.audit=audit;}
      assert.equal(await service.repo.get("SELECT id FROM users WHERE alias='rollback-owner@pincode'"),undefined);
      const restored=await service.enroll(input(invitation,'rollback-owner'));assert.ok(restored.session);
    });
    await t.test('audit failures roll back invitation recovery location and deletion transactions',async()=>{
      const actor=await service.enroll(input((await service.invite()).invitation,'atomic-owner'));const audit=service.audit;
      const before=await service.repo.get('SELECT count(*) AS count FROM invitations');
      service.audit=async()=>{throw new Error('Injected audit failure');};
      try{
        await assert.rejects(()=>service.invite());
        assert.equal((await service.repo.get('SELECT count(*) AS count FROM invitations')).count,before.count);
        await assert.rejects(()=>service.recover(actor.recovery_credential));assert.equal(await service.owner(actor.session),actor.profile.id);
        await assert.rejects(()=>service.saveLocation(actor.profile.id,{...input('','').location,label:'Changed'}));
        assert.equal((await service.profile(actor.profile.id)).location.label,'Private synthetic home');
        await assert.rejects(()=>service.deleteLocation(actor.profile.id,actor.profile.location.id));
        assert.ok((await service.profile(actor.profile.id)).location);
        await assert.rejects(()=>service.deleteUser(actor.profile.id,actor.recovery_credential));
        assert.equal(await service.owner(actor.session),actor.profile.id);
      }finally{service.audit=audit;}
      assert.ok((await service.recover(actor.recovery_credential)).session);
    });
    await t.test('encrypted location compatibility, tampering and wrong-key refusal',async()=>{
      const stored=await service.repo.get('SELECT encrypted FROM locations WHERE user_id=?',first.profile.id);
      assert.ok(!stored.encrypted.includes('12.972579'));assert.ok(!stored.encrypted.includes('Private synthetic home'));
      assert.equal(s.decrypt(config.encryptionKey,first.profile.id,first.profile.location.id,stored.encrypted).digipin,'4P3JK83M28');
      const payload=JSON.parse(stored.encrypted);payload.tag=s.token().slice(0,22);
      await service.repo.run('UPDATE locations SET encrypted=? WHERE user_id=?',JSON.stringify(payload),first.profile.id);
      await assert.rejects(()=>service.profile(first.profile.id));await service.repo.run('UPDATE locations SET encrypted=? WHERE user_id=?',stored.encrypted,first.profile.id);
      await assert.rejects(()=>Service.create({...config,encryptionKey:Buffer.from(s.token(),'base64url')}));
    });
    await t.test('owner API rejects BOLA CSRF unauthenticated access and legacy lookup',async()=>{
      const cookie=`__Host-pinid_lite=${first.session}`;
      for(const route of ['/api/me','/api/me/export',`/api/locations/${first.profile.location.id}`])assert.equal((await request(route)).status,401);
      assert.equal((await request(`/api/locations/${second.profile.location.id}`,'GET',undefined,cookie)).status,404);
      assert.equal((await request('/api/locations/not-a-uuid','GET',undefined,cookie)).status,404);
      assert.equal((await request(`/api/locations/${second.profile.location.id}`,'DELETE',{},cookie,service.csrf(first.session))).status,404);
      assert.equal((await request('/api/location','PUT',input('', '').location,cookie)).status,403);
      const me=await request('/api/me','GET',undefined,cookie);assert.equal(me.status,200);assert.equal((await me.json()).location.digipin,'4P3JK83M28');
      assert.equal((await request('/api/digipin/encode','GET',undefined,cookie)).status,404);
      const bad={...input('','').location,latitude:null};assert.equal((await request('/api/location','PUT',bad,cookie,service.csrf(first.session))).status,400);
      assert.equal((await request('/api/location','PUT',input('','').location,cookie,service.csrf(first.session))).status,200);
      assert.equal((await request(`/api/locations/${first.profile.location.id}`,'DELETE',{},cookie,service.csrf(first.session))).status,204);
      assert.equal((await request('/api/location','PUT',input('','').location,cookie,service.csrf(first.session))).status,200);
      first.profile=await service.profile(first.profile.id);
    });
    await t.test('recovery sessions concurrent rotation logout expiry and account deletion',async()=>{
      const recovered=await service.recover(first.recovery_credential);await assert.rejects(()=>service.owner(first.session),{code:'UNAUTHORIZED'});
      const sessions=await Promise.all([service.recover(first.recovery_credential),service.recover(first.recovery_credential)]);
      const valid=await Promise.allSettled(sessions.map(x=>service.owner(x.session)));assert.equal(valid.filter(x=>x.status==='fulfilled').length,1);
      await service.logout(sessions.find((_,i)=>valid[i].status==='fulfilled').session);
      await assert.rejects(()=>service.owner(recovered.session),{code:'UNAUTHORIZED'});
      const expired=await service.recover(second.recovery_credential);now+=3600001;await assert.rejects(()=>service.owner(expired.session),{code:'UNAUTHORIZED'});
      await assert.rejects(()=>service.deleteUser(first.profile.id,second.recovery_credential),{code:'RECOVERY_FAILED'});
      await service.deleteUser(second.profile.id,second.recovery_credential);await assert.rejects(()=>service.recover(second.recovery_credential),{code:'RECOVERY_FAILED'});
    });
    await t.test('rate limit persists across pools and enforces concurrent ceiling',async()=>{
      const bucket=s.token();const results=await Promise.allSettled(Array.from({length:12},()=>service.repo.rate(bucket,10,600,now)));
      assert.equal(results.filter(x=>x.status==='fulfilled').length,10);
      const other=new PostgresRepository(runtimePg);try{await assert.rejects(()=>other.rate(bucket,10,600,now),{code:'RATE_LIMITED'});}finally{await other.close();}
    });
    await t.test('database unavailable health/API fail generically and pool acquisition times out',async()=>{
      await admin.query('ALTER SCHEMA pinid RENAME TO pinid_offline');
      try {assert.equal((await request('/healthz')).status,503);const response=await request('/api/me');assert.equal(response.status,503);assert.equal((await response.json()).error.code,'SERVICE_UNAVAILABLE');}
      finally{await admin.query('ALTER SCHEMA pinid_offline RENAME TO pinid');}
      const database='"'+parsed.pathname.slice(1).replaceAll('"','""')+'"';
      await admin.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`);
      await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='pinid_runtime_test' AND datname=current_database()");
      try{assert.equal((await request('/healthz')).status,503);assert.equal((await request('/api/me')).status,503);}
      finally{await admin.query(`GRANT CONNECT ON DATABASE ${database} TO PUBLIC`);}
      const limited=new PostgresRepository({...runtimePg,max:1,connectionTimeoutMillis:1000});const held=await limited.pool.connect();
      try{await assert.rejects(()=>limited.get('SELECT 1'));}finally{held.release();await limited.close();}
      const outage=new PostgresRepository({...runtimePg,connectionString:'postgresql://nobody@127.0.0.1:1/pinid_test',connectionTimeoutMillis:100});
      try{await assert.rejects(()=>outage.get('SELECT 1'));}finally{await outage.close();}
    });
    await t.test('actual application process restarts retain recovery ciphertext and private owner profile without log leakage',async()=>{
      const run=async()=>{
        const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'development',PINID_LITE_ENABLED:'true',PINID_STORAGE_BACKEND:'postgres',PINID_DATABASE_URL:runtime.toString(),PINID_PG_TLS:'disable',PINID_ORIGIN:'http://127.0.0.1:5001',PINID_ALLOW_LOCAL_HTTP:'true',PINID_ENCRYPTION_KEY:config.encryptionKey.toString('base64url'),PINID_SESSION_SECRET:config.sessionSecret,PINID_ADMIN_SECRET:config.adminSecret,PORT:'0',PINID_HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
        let logs='';child.stderr.on('data',x=>logs+=x);let stdout='';
        try{const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Readiness timeout')),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error('Startup failed'));});child.stdout.on('data',x=>{stdout+=x;const found=stdout.match(/127\.0\.0\.1:(\d+)/);if(found){clearTimeout(timer);resolve(found[1]);}});});
          const response=await fetch(`http://127.0.0.1:${port}/api/recover`,{method:'POST',headers:{Origin:'http://127.0.0.1:5001','Content-Type':'application/json'},body:JSON.stringify({credential:first.recovery_credential})});
          assert.equal(response.status,200);assert.equal((await response.json()).location.digipin,'4P3JK83M28');
        }finally{child.kill();await once(child,'exit');}
        for(const secret of [runtime.toString(),config.sessionSecret,config.adminSecret,first.recovery_credential,'12.972579','Private synthetic home'])assert.ok(!(logs+stdout).includes(secret));
      };await run();await run();
    });
  }finally{await new Promise(resolve=>server.close(resolve));await service.close();await admin.close();}
});
