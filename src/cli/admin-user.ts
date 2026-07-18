import "dotenv/config";
import { createDatabase } from "../db/client.js";
import { AdminIdentityRepository, type AdminRole } from "../security/admin-identity.js";

const args=Object.fromEntries(process.argv.slice(2).map(value=>{const[key,...rest]=value.replace(/^--/,"").split("=");return[key,rest.join("=")||true]}));
const action=String(args.action||"list"),{db,close}=createDatabase(),users=new AdminIdentityRepository(db);
try{
  if(action==="list")console.log(JSON.stringify(await users.list(),null,2));
  else if(action==="create"){const username=String(args.username||""),password=String(process.env.ADMIN_NEW_PASSWORD||args.password||""),role=String(args.role||"owner") as AdminRole;if(!username||!password)throw new Error("--username and ADMIN_NEW_PASSWORD are required");console.log(JSON.stringify(await users.create(username,password,role),null,2));}
  else if(action==="reset-password"){const id=String(args.id||""),password=String(process.env.ADMIN_NEW_PASSWORD||args.password||"");if(!id||!password)throw new Error("--id and ADMIN_NEW_PASSWORD are required");await users.resetPassword(id,password);console.log("Password reset and sessions revoked.");}
  else if(action==="revoke-sessions"){const id=String(args.id||"");if(!id)throw new Error("--id is required");console.log(`Revoked sessions: ${await users.revokeUserSessions(id)}`);}
  else throw new Error("Supported actions: list, create, reset-password, revoke-sessions");
}finally{await close()}
