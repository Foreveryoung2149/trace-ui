"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export default function OrderControls() {
  const router=useRouter();const [error,setError]=useState("");
  async function signOut(){try{const result=await fetch("/api/session",{method:"DELETE"});if(!result.ok)throw new Error();router.replace("/sign-in");router.refresh();}catch{setError("Sign-out could not complete. Try again.");}}
  return <div className="order-controls"><button onClick={()=>router.refresh()}>Refresh saved updates</button><button onClick={signOut}>Sign out</button>{error&&<p role="alert">{error}</p>}</div>;
}
