'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {loadConfig}=require('../src/config');const {token}=require('../src/security');
const env=()=>({PINID_LITE_ENABLED:'true',PINID_STORAGE_BACKEND:'postgres',PINID_ORIGIN:'https://pinid.test',PINID_DATABASE_URL:'postgresql://runtime:placeholder@localhost/pinid_test',PINID_ENCRYPTION_KEY:token(),PINID_SESSION_SECRET:token(),PINID_ADMIN_SECRET:token()});
test('auto migration is opt-in and requires a validated credential for the same target',()=>{
  const base=env();assert.equal(loadConfig(base).autoMigrate,false);
  assert.throws(()=>loadConfig({...base,PINID_AUTO_MIGRATE:'TRUE'}));
  const configured={...base,PINID_AUTO_MIGRATE:' TRUE ',PINID_MIGRATION_DATABASE_URL:'postgresql://migrator:placeholder@localhost/pinid_test'};
  assert.equal(loadConfig(configured).autoMigrate,true);
  assert.equal(loadConfig({...configured,PINID_MIGRATION_DATABASE_URL:base.PINID_DATABASE_URL}).autoMigrate,true);
  assert.throws(()=>loadConfig({...configured,PINID_MIGRATION_DATABASE_URL:'postgresql://migrator:placeholder@localhost/other_test'}),/target mismatch/);
});
