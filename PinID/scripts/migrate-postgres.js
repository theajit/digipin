'use strict';
require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});
const {postgresConfig}=require('../src/postgres-config');const {migrate}=require('../src/postgres-repository');
async function main(){await migrate(postgresConfig(process.env,true));process.stdout.write('PinID PostgreSQL migrations verified.\n');}
main().catch(()=>{process.stderr.write('PinID PostgreSQL migration failed. Check configuration, permissions, server version and checksums; preserve data.\n');process.exitCode=1;});
