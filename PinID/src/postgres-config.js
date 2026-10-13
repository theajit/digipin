'use strict';
function postgresConfig(env=process.env, migration=false) {
  const connectionString= migration ? env.PINID_MIGRATION_DATABASE_URL : env.PINID_DATABASE_URL;
  let url; try { url=new URL(connectionString); } catch { throw new Error('PostgreSQL configuration invalid'); }
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.pathname.slice(1)||url.search||url.hash) throw new Error('PostgreSQL configuration invalid');
  const tls=env.PINID_PG_TLS||'verify-full';
  if(!['verify-full','disable'].includes(tls))throw new Error('PostgreSQL configuration invalid');
  if((env.PINID_DB_SCHEMA||'pinid')!=='pinid'||(env.PINID_STORAGE_VERSION||'postgres-v1')!=='postgres-v1')throw new Error('PostgreSQL configuration invalid');
  const max=Number(env.PINID_DB_POOL_MAX||env.PINID_PG_POOL_MAX||10);
  const timeout=Number(env.PINID_DB_CONNECTION_TIMEOUT_MS||5000);
  if(!Number.isInteger(max)||max<1||max>50)throw new Error('PostgreSQL configuration invalid');
  if(!Number.isInteger(timeout)||timeout<100||timeout>30000)throw new Error('PostgreSQL configuration invalid');
  return {connectionString,ssl:tls==='verify-full'?{rejectUnauthorized:true}:false,max,
    connectionTimeoutMillis:timeout,idleTimeoutMillis:30000,statement_timeout:5000,
    options:'-c search_path=pinid,pg_catalog',application_name:'pinid'};
}
module.exports={postgresConfig};
