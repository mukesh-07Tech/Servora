import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const hash=async(v:string)=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')};
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 const {phone}=await req.json();const normalized=String(phone||'').replace(/\D/g,'');if(!/^\d{10,15}$/.test(normalized))return json({error:'Enter a valid mobile number.'},400);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const db=createClient(url,key);const since=new Date(Date.now()-15*60*1000).toISOString();const {count}=await db.from('otp_challenges').select('*',{count:'exact',head:true}).eq('phone',normalized).gte('created_at',since);if((count||0)>=5)return json({error:'Too many OTP requests. Try again later.'},429);
 const otp=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');const {error}=await db.from('otp_challenges').insert({phone:normalized,otp_hash:await hash(otp),purpose:'order_history',expires_at:new Date(Date.now()+5*60*1000).toISOString()});if(error)throw error;
 const production=Deno.env.get('APP_ENV')==='production';
 // In development, return the generated OTP on the verification screen. In production, connect an SMS provider and never return it.
 if(production)return json({message:'OTP challenge created. Configure an SMS provider to deliver the code.'});
 return json({message:'Development OTP generated.',test_otp:otp,expires_in_seconds:300});
 }catch(e){return json({error:e.message||'Unable to create OTP challenge.'},500)}});
