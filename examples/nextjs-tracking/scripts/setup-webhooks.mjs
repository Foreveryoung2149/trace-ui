import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
if(!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to your own starter database, not a Trace service database.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
try{await pool.query(await readFile(new URL('./webhook-inbox.sql',import.meta.url),'utf8'));console.log('Webhook inbox ready. No messages sent.');}finally{await pool.end();}
