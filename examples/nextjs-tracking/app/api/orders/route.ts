import { cookies } from "next/headers";
import { starterConfiguration } from "../../../lib/configuration";
import { starterDatabase } from "../../../lib/database";
import { customerSession, SESSION_COOKIE } from "../../../lib/customer-auth";
import { ownedOrders } from "../../../lib/order-store";

const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
export async function GET() {
  try {
    const config=starterConfiguration();
    const db=starterDatabase();
    const identity=await customerSession(db,config.tenantId,(await cookies()).get(SESSION_COOKIE)?.value);
    if(!identity) return Response.json({error:"authentication_required"},{status:401,headers});
    return Response.json({simulated:config.mode==="fixture",orders:await ownedOrders(db,identity,config.mode)},{headers});
  }catch{return Response.json({error:"orders_unavailable"},{status:503,headers});}
}
