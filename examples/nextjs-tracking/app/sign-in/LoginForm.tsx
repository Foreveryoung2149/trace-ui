"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [error,setError]=useState("");const [pending,setPending]=useState(false);const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setPending(true);setError("");
    const data=new FormData(event.currentTarget);
    try {
      const result=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({handle:data.get("handle"),password:data.get("password")})});
      if(result.ok){router.replace("/orders");router.refresh();return;}
      setError(result.status===429?"Too many attempts. Try again in 15 minutes.":result.status===503?"Sign-in is unavailable. Check the server configuration.":"Those credentials could not be verified.");
    }catch{setError("Sign-in could not complete. Try again.");}finally{setPending(false);}
  }
  return <form className="order-signin" onSubmit={submit}>
    <label htmlFor="handle">Customer handle</label><input id="handle" name="handle" autoComplete="username" required maxLength={128}/>
    <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256}/>
    <button disabled={pending}>{pending?"Signing in…":"View my orders"}</button>{error&&<p role="alert">{error}</p>}
  </form>;
}
