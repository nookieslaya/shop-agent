import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { StoreConfig } from "../config/store.js";
import type { Database } from "../db/client.js";
import { apiRequestEvents } from "../db/schema.js";

export type ObservabilityConfig = NonNullable<StoreConfig["observability"]>;
export const defaultObservability: ObservabilityConfig = { enabled:true, successSampleRate:1, slowRequestMs:2000, errorRateAlertPercent:5, p95AlertMs:3000, retentionDays:30, minimumRequestsForAlert:20 };
export type RequestMetric = { requestId:string; method:string; route:string; statusCode:number; latencyMs:number; errorCode:string|null; createdAt:Date };

export function percentile(values:number[], fraction:number):number {
  if(!values.length)return 0; const sorted=[...values].sort((a,b)=>a-b),index=Math.ceil(fraction*sorted.length)-1;
  return sorted[Math.max(0,index)]!;
}
export function summarizeRequestMetrics(rows:RequestMetric[], config:ObservabilityConfig){
  const latencies=rows.map(row=>row.latencyMs),errors=rows.filter(row=>row.statusCode>=500),slow=rows.filter(row=>row.latencyMs>=config.slowRequestMs);
  const total=rows.length,errorRate=total?Number((errors.length/total*100).toFixed(1)):0,slowRate=total?Number((slow.length/total*100).toFixed(1)):0;
  const routes=new Map<string,{method:string;route:string;requests:number;errors:number;latencies:number[]}>();
  for(const row of rows){const key=`${row.method} ${row.route}`,item=routes.get(key)??{method:row.method,route:row.route,requests:0,errors:0,latencies:[]};item.requests++;if(row.statusCode>=500)item.errors++;item.latencies.push(row.latencyMs);routes.set(key,item)}
  const routeSummary=[...routes.values()].map(item=>({method:item.method,route:item.route,requests:item.requests,errors:item.errors,errorRate:item.requests?Number((item.errors/item.requests*100).toFixed(1)):0,p95Ms:percentile(item.latencies,.95)})).sort((a,b)=>b.requests-a.requests).slice(0,10);
  const enough=total>=config.minimumRequestsForAlert,alerts=[] as Array<{key:string;severity:"warning"|"critical";message:string}>;
  const p95Ms=percentile(latencies,.95),p99Ms=percentile(latencies,.99);
  if(enough&&errorRate>=config.errorRateAlertPercent)alerts.push({key:"error_rate",severity:errorRate>=config.errorRateAlertPercent*2?"critical":"warning",message:`Błędy serwera stanowią ${errorRate}% żądań (próg ${config.errorRateAlertPercent}%).`});
  if(enough&&p95Ms>=config.p95AlertMs)alerts.push({key:"latency_p95",severity:p95Ms>=config.p95AlertMs*2?"critical":"warning",message:`P95 wynosi ${p95Ms} ms (próg ${config.p95AlertMs} ms).`});
  return {summary:{requests:total,errors:errors.length,errorRate,slowRequests:slow.length,slowRate,p50Ms:percentile(latencies,.5),p95Ms,p99Ms},routes:routeSummary,alerts,alertEvaluation:{minimumRequests:config.minimumRequestsForAlert,enoughData:enough}};
}

export class RequestMetricsRepository {
  constructor(private db:Database){}
  async record(input:{storeId?:string;requestId:string;method:string;route:string;statusCode:number;latencyMs:number;errorCode?:string}){await this.db.insert(apiRequestEvents).values({...input,storeId:input.storeId??null,errorCode:input.errorCode??null})}
  async dashboard(storeId:string,days:number,config:ObservabilityConfig){const since=new Date(Date.now()-days*86_400_000);const rows=await this.db.select({requestId:apiRequestEvents.requestId,method:apiRequestEvents.method,route:apiRequestEvents.route,statusCode:apiRequestEvents.statusCode,latencyMs:apiRequestEvents.latencyMs,errorCode:apiRequestEvents.errorCode,createdAt:apiRequestEvents.createdAt}).from(apiRequestEvents).where(and(eq(apiRequestEvents.storeId,storeId),gte(apiRequestEvents.createdAt,since))).orderBy(desc(apiRequestEvents.createdAt));const result=summarizeRequestMetrics(rows,config);return{period:{days,generatedAt:new Date()},...result,recentErrors:rows.filter(row=>row.statusCode>=500).slice(0,20)}}
  async purge(storeId:string,retentionDays:number){const before=new Date(Date.now()-retentionDays*86_400_000);const deleted=await this.db.delete(apiRequestEvents).where(and(eq(apiRequestEvents.storeId,storeId),lt(apiRequestEvents.createdAt,before))).returning({id:apiRequestEvents.id});return deleted.length}
}
