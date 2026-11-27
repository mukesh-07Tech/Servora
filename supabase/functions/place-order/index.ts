import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 const body=await req.json();const token=String(body.table_token||'');const idempotencyKey=String(body.idempotency_key||'');const customer=body.customer||{};const items=body.items||[];
 if(token.length<20||idempotencyKey.length<16||!customer.name||String(customer.phone||'').replace(/\D/g,'').length<10||!Array.isArray(items)||!items.length)return json({error:'Complete customer details and scan a valid table QR before ordering.'},400);
 if(items.length>40)return json({error:'Too many items in one order.'},400);
 const accessToken=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
 const {data,error}=await db.rpc('place_order',{p_table_token:token,p_customer:{name:String(customer.name).slice(0,100),phone:String(customer.phone),persons:Number(customer.persons)||1},p_items:items,p_access_token:accessToken,p_idempotency_key:idempotencyKey});if(error)throw error;
 return json({order:{...data,access_token:accessToken}});
 }catch(e){return json({error:e.message||'Order could not be placed.'},400)}});
