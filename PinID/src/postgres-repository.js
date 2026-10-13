'use strict';
const {Pool}=require('pg');const {AsyncLocalStorage}=require('node:async_hooks');
const fs=require('node:fs');const path=require('node:path');const {hash,LiteError}=require('./security');
const files=()=>fs.readdirSync(path.join(__dirname,'../migrations/postgres')).filter(x=>/^\d{3}_[a-z0-9_]+\.sql$/.test(x)).sort();
function migrations(){return files().map(name=>({version:Number(name.slice(0,3)),sql:fs.readFileSync(path.join(__dirname,'../migrations/postgres',name),'utf8').replace(/\r\n/g,'\n')}));}
// Only internal trusted SQL templates reach this adapter; all data is bound separately.
function parameters(sql){let i=0;let quoted=false;let result='';for(let n=0;n<sql.length;n++){
  const c=sql[n];if(c==="'"){if(quoted&&sql[n+1]==="'"){result+="''";n++;continue;}quoted=!quoted;}
  result+=c==='?'&&!quoted?`$${++i}`:c;
}return result;}
function row(value){if(!value)return value;for(const name of ['created_at','updated_at','expires_at','consumed_at']){
  if(value[name]!=null){const number=Number(value[name]);if(!Number.isSafeInteger(number))throw new Error('Timestamp invalid');value[name]=number;}
}return value;}
class PostgresRepository {
  constructor(config){this.pool=new Pool(config);this.context=new AsyncLocalStorage();this.pool.on('error',()=>{});}
  async query(sql,args=[]){return (this.context.getStore()||this.pool).query(parameters(sql),args);}
  async get(sql,...args){return row((await this.query(sql,args)).rows[0]);}
  async all(sql,...args){return (await this.query(sql,args)).rows.map(row);}
  async run(sql,...args){const result=await this.query(sql,args);return {changes:result.rowCount};}
  async transaction(work){if(this.context.getStore())throw new Error('Nested transaction unsupported');
    const client=await this.pool.connect();let broken=false;
    try {await client.query('BEGIN');const result=await this.context.run(client,work);await client.query('COMMIT');return result;}
    catch(error){try{await client.query('ROLLBACK');}catch{broken=true;}throw error;}
    finally{client.release(broken);}
  }
  async verify(){const version=await this.get('SHOW server_version_num');if(Number(version.server_version_num)<170000)throw new Error('PostgreSQL 17 required');
    const rows=await this.all('SELECT version,checksum FROM pinid.schema_migrations ORDER BY version');const expected=migrations();
    if(rows.length!==expected.length||expected.some((item,index)=>rows[index].version!==item.version||rows[index].checksum!==hash(item.sql)))throw new Error('PostgreSQL migrations invalid');
  }
  async rate(bucket,maximum,windowSeconds,now){
    const result=await this.get('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<=? THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<=? THEN excluded.expires_at ELSE rate_limits.expires_at END WHERE rate_limits.expires_at<=? OR rate_limits.count<? RETURNING count',bucket,now+windowSeconds*1000,now,now,now,maximum);
    if(!result)throw new LiteError('RATE_LIMITED',429);
  }
  async close(){await this.pool.end();}
}
async function migrate(config){const repo=new PostgresRepository(config);try{await repo.transaction(async()=>{
  await repo.query("SELECT pg_advisory_xact_lock(74120601)");
  const version=await repo.get('SHOW server_version_num');if(Number(version.server_version_num)<170000)throw new Error('PostgreSQL 17 required');
  await repo.query('CREATE SCHEMA IF NOT EXISTS pinid');await repo.query('CREATE TABLE IF NOT EXISTS pinid.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL)');
  const existing=await repo.all('SELECT version,checksum FROM pinid.schema_migrations ORDER BY version');const expected=migrations();
  if(existing.some(entry=>!expected.some(item=>entry.version===item.version&&entry.checksum===hash(item.sql))))throw new Error('PostgreSQL migrations invalid');
  for(const item of expected){if(existing.some(entry=>entry.version===item.version))continue;await repo.query(item.sql);await repo.run('INSERT INTO pinid.schema_migrations VALUES(?,?)',item.version,hash(item.sql));}
});}finally{await repo.close();}}
module.exports={PostgresRepository,migrate,parameters};
