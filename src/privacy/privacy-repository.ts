import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { adminAuditEvents, conversations } from "../db/schema.js";

export class PrivacyRepository {
  constructor(private readonly db:Database){}
  async audit(input:{storeId?:string;actor:string;action:string;targetType:string;targetId?:string;metadata?:Record<string,unknown>}){
    await this.db.insert(adminAuditEvents).values({...input,metadata:input.metadata??{}});
  }
  async removeConversation(storeId:string,id:string,actor:string){
    const deleted=await this.db.delete(conversations).where(and(eq(conversations.storeId,storeId),eq(conversations.id,id))).returning({id:conversations.id});
    if(deleted.length)await this.audit({storeId,actor,action:"conversation.delete",targetType:"conversation",targetId:id});
    return deleted.length===1;
  }
  async removeAll(storeId:string,actor:string){
    const deleted=await this.db.delete(conversations).where(eq(conversations.storeId,storeId)).returning({id:conversations.id});
    await this.audit({storeId,actor,action:"conversation.delete_all",targetType:"store",targetId:storeId,metadata:{deleted:deleted.length}});
    return deleted.length;
  }
  async purgeExpired(storeId:string,retentionDays:number,actor="retention-worker"){
    const cutoff=new Date(Date.now()-retentionDays*86_400_000);
    const deleted=await this.db.delete(conversations).where(and(eq(conversations.storeId,storeId),lt(conversations.lastMessageAt,cutoff))).returning({id:conversations.id});
    if(deleted.length)await this.audit({storeId,actor,action:"conversation.retention_purge",targetType:"store",targetId:storeId,metadata:{deleted:deleted.length,retentionDays,cutoff:cutoff.toISOString()}});
    return deleted.length;
  }
  async statistics(storeId:string,retentionDays:number){
    const [result]=await this.db.select({count:sql<number>`count(*)::int`,oldest:sql<Date|null>`min(${conversations.startedAt})`,expiring:sql<number>`count(*) filter (where ${conversations.lastMessageAt} < now() + interval '7 days' - (${retentionDays} * interval '1 day'))::int`}).from(conversations).where(eq(conversations.storeId,storeId));
    return result??{count:0,oldest:null,expiring:0};
  }
  async auditLog(storeId:string,limit=50){return this.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.storeId,storeId)).orderBy(desc(adminAuditEvents.createdAt)).limit(limit)}
}
