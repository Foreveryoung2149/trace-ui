import { NextResponse } from "next/server";
import { starterDatabase } from "../../../lib/database";
import { sameOrigin, starterConfiguration } from "../../../lib/configuration";
import { revokeSession, SESSION_COOKIE, SESSION_SECONDS, signInCustomer } from "../../../lib/customer-auth";

export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
export async function POST(request:Request) {
  try {
    const config=starterConfiguration();
    if(!sameOrigin(request,config.origin)) return NextResponse.json({error:"origin_not_allowed"},{status:403,headers});
    if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({error:"json_required"},{status:415,headers});
    const reader=request.body?.getReader();let raw="";let bytes=0;
    if(!reader) return NextResponse.json({error:"invalid_credentials"},{status:400,headers});
    const chunks:Uint8Array[]=[];
    for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>4096){await reader.cancel();return NextResponse.json({error:"payload_too_large"},{status:413,headers});}chunks.push(next.value);}
    raw=Buffer.concat(chunks).toString("utf8");
    let input:unknown;try{input=JSON.parse(raw);}catch{return NextResponse.json({error:"invalid_credentials"},{status:400,headers});}
    if(!input||typeof input!=="object"||!("handle" in input)||!("password" in input)||typeof input.handle!=="string"||typeof input.password!=="string") return NextResponse.json({error:"invalid_credentials"},{status:400,headers});
    const outcome=await signInCustomer(starterDatabase(),config,input.handle,input.password);
    if("error" in outcome) return NextResponse.json({error:outcome.error},{status:outcome.error==="rate_limited"?429:401,headers});
    const response=NextResponse.json({signed_in:true},{headers});
    response.cookies.set(SESSION_COOKIE,outcome.token,{httpOnly:true,secure:config.origin.startsWith("https:"),sameSite:"strict",path:"/",maxAge:SESSION_SECONDS});
    return response;
  } catch{return NextResponse.json({error:"sign_in_unavailable"},{status:503,headers});}
}
export async function DELETE(request:Request) {
  try {
    const config=starterConfiguration();
    if(!sameOrigin(request,config.origin)) return NextResponse.json({error:"origin_not_allowed"},{status:403,headers});
    const token=new Map((request.headers.get("cookie")||"").split(";").map(item=>{const index=item.indexOf("=");return [item.slice(0,index).trim(),item.slice(index+1)] as const;})).get(SESSION_COOKIE);
    await revokeSession(starterDatabase(),config.tenantId,token);
    const response=NextResponse.json({signed_out:true},{headers});
    response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,secure:config.origin.startsWith("https:"),sameSite:"strict",path:"/",maxAge:0});
    return response;
  }catch{return NextResponse.json({error:"sign_out_unavailable"},{status:503,headers});}
}
