import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
test('Postgres deduplicates concurrent events and persists across connections',{skip:!process.env.TRACE_STARTER_TEST_DATABASE_URL},async()=>{
  const pool=new Pool({connectionString:process.env.TRACE_STARTER_TEST_DATABASE_URL,max:3});
  const id=`evt_test_${randomUUID()}`;
  try{
    await pool.query(await readFile(new URL('../scripts/webhook-inbox.sql',import.meta.url),'utf8'));
    const results=await Promise.all(Array.from({length:4},()=>pool.query('INSERT INTO trace_webhook_inbox (event_id,event_type,payload) VALUES ($1,$2,$3::jsonb) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',[id,'tracking.updated',JSON.stringify({event_id:id})])));
    assert.equal(results.reduce((sum,row)=>sum+row.rowCount,0),1);
    const connection=await pool.connect();try{assert.equal((await connection.query('SELECT payload FROM trace_webhook_inbox WHERE event_id=$1',[id])).rows[0].payload.event_id,id);}finally{connection.release();}
  }finally{await pool.query('DELETE FROM trace_webhook_inbox WHERE event_id=$1',[id]);await pool.end();}
});
