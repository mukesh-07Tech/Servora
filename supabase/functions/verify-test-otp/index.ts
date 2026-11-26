import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const hash=async(v:string)=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')};
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 const {phone,otp}=await req.json();const normalized=String(phone||'').replace(/\D/g,'');if(!/^\d{10,15}$/.test(normalized)||!/^\d{6}$/.test(String(otp||'')))return json({error:'Invalid mobile number or OTP.'},400);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);const {data:ch,error}=await db.from('otp_challenges').select('*').eq('phone',normalized).eq('purpose','order_history').is('consumed_at',null).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;if(!ch)return json({error:'OTP expired. Request a new code.'},400);if(ch.attempts>=5)return json({error:'Too many incorrect attempts.'},429);
 if(ch.otp_hash!==await hash(String(otp))){await db.from('otp_challenges').update({attempts:ch.attempts+1}).eq('id',ch.id);return json({error:'Incorrect OTP.'},400)}
 await db.from('otp_challenges').update({consumed_at:new Date().toISOString()}).eq('id',ch.id);
 // History lookup is intentionally scoped to the verified phone. Only non-sensitive order summary fields are returned.
 const {data:orders,error:oe}=await db.from('orders').select('id,order_number,status,total,created_at,table_label').eq('customer_phone',normalized).order('created_at',{ascending:false}).limit(30);if(oe)throw oe;return json({verified:true,orders:orders||[]});
 }catch(e){return json({error:e.message||'OTP verification failed.'},500)}});
