import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { adminSessions, adminUsers } from "../db/schema.js";

const scrypt=promisify(scryptCallback),sessionDays=7;
export type AdminRole="owner"|"operator"|"viewer";
export type AdminIdentity={id:string;username:string;role:AdminRole};
const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export async function hashAdminPassword(password:string){if(password.length<12)throw new Error("Password must contain at least 12 characters");const salt=randomBytes(16).toString("base64url"),derived=await scrypt(password,salt,64) as Buffer;return`scrypt:${salt}:${derived.toString("base64url")}`}
export async function verifyHashedPassword(password:string,encoded:string){const[type,salt,expected]=encoded.split(":");if(type!=="scrypt"||!salt||!expected)return false;const derived=await scrypt(password,salt,64) as Buffer,wanted=Buffer.from(expected,"base64url");return derived.length===wanted.length&&timingSafeEqual(derived,wanted)}
export class AdminIdentityRepository{
  constructor(private readonly db:Database){}
  async count(){return (await this.db.select({id:adminUsers.id}).from(adminUsers)).length}
  async list(){return this.db.select({id:adminUsers.id,username:adminUsers.username,role:adminUsers.role,enabled:adminUsers.enabled,lastLoginAt:adminUsers.lastLoginAt,createdAt:adminUsers.createdAt}).from(adminUsers).orderBy(adminUsers.username)}
  async create(username:string,password:string,role:AdminRole="owner"){const[row]=await this.db.insert(adminUsers).values({username:username.trim().toLowerCase(),passwordHash:await hashAdminPassword(password),role}).returning({id:adminUsers.id,username:adminUsers.username,role:adminUsers.role});if(!row)throw new Error("Administrator creation failed");return row}
  async resetPassword(id:string,password:string){const passwordHash=await hashAdminPassword(password);await this.db.transaction(async tx=>{await tx.update(adminUsers).set({passwordHash,failedLoginCount:0,lockedUntil:null,updatedAt:new Date()}).where(eq(adminUsers.id,id));await tx.delete(adminSessions).where(eq(adminSessions.userId,id));})}
  async setEnabled(id:string,enabled:boolean){await this.db.update(adminUsers).set({enabled,updatedAt:new Date()}).where(eq(adminUsers.id,id));if(!enabled)await this.db.delete(adminSessions).where(eq(adminSessions.userId,id))}
  async remove(id:string){await this.db.delete(adminUsers).where(eq(adminUsers.id,id))}
  async login(username:string,password:string){const[user]=await this.db.select().from(adminUsers).where(eq(adminUsers.username,username.trim().toLowerCase())).limit(1);if(!user||!user.enabled||user.lockedUntil&&user.lockedUntil>new Date())return null;if(!await verifyHashedPassword(password,user.passwordHash)){const failures=user.failedLoginCount+1;await this.db.update(adminUsers).set({failedLoginCount:failures,lockedUntil:failures>=5?new Date(Date.now()+15*60_000):null}).where(eq(adminUsers.id,user.id));return null}const token=randomBytes(32).toString("base64url"),expiresAt=new Date(Date.now()+sessionDays*86_400_000);await this.db.transaction(async tx=>{await tx.update(adminUsers).set({failedLoginCount:0,lockedUntil:null,lastLoginAt:new Date()}).where(eq(adminUsers.id,user.id));await tx.insert(adminSessions).values({userId:user.id,tokenHash:tokenHash(token),expiresAt})});return{token,identity:{id:user.id,username:user.username,role:user.role}}}
  async session(token:string|undefined){if(!token)return null;const[row]=await this.db.select({sessionId:adminSessions.id,userId:adminUsers.id,username:adminUsers.username,role:adminUsers.role}).from(adminSessions).innerJoin(adminUsers,eq(adminSessions.userId,adminUsers.id)).where(and(eq(adminSessions.tokenHash,tokenHash(token)),gt(adminSessions.expiresAt,new Date()),eq(adminUsers.enabled,true))).limit(1);if(!row)return null;await this.db.update(adminSessions).set({lastSeenAt:new Date()}).where(eq(adminSessions.id,row.sessionId));return{id:row.userId,username:row.username,role:row.role}}
  async logout(token:string|undefined){if(token)await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash,tokenHash(token)))}
  async revokeUserSessions(id:string){const deleted=await this.db.delete(adminSessions).where(eq(adminSessions.userId,id)).returning({id:adminSessions.id});return deleted.length}
  async cleanup(){await this.db.delete(adminSessions).where(lt(adminSessions.expiresAt,new Date()))}
}
