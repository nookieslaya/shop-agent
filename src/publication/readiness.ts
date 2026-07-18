import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { StoreConfig } from "../config/store.js";
import type { Database } from "../db/client.js";
import { knowledgeDocuments, products, qualityScenarioRuns, qualityScenarios, runtimeHeartbeats, syncJobs } from "../db/schema.js";

export type PublicationCheck={key:string;label:string;passed:boolean;required:boolean;message:string;action?:string};
export type PublicationFacts={products:number;enrichedProducts:number;knowledgeDocuments:number;activeJobs:number;successfulCatalogSync:boolean;qualityScenarios:number;qualityPassed:number;backupFresh:boolean;backupVerified:boolean};
const defaults={minimumProducts:1,minimumEnrichmentPercent:80,requireKnowledgeSources:true,minimumQualityScenarios:3,requireAllQualityPassing:true};

export function evaluatePublication(config:StoreConfig,facts:PublicationFacts){const requirements=config.publicationRequirements??defaults,enrichment=facts.products?Math.round(facts.enrichedProducts/facts.products*100):0,checks:PublicationCheck[]=[
  {key:"catalog",label:"Katalog produktów",passed:facts.products>=requirements.minimumProducts,required:true,message:`${facts.products} produktów; wymagane minimum ${requirements.minimumProducts}`,action:"sync"},
  {key:"catalog_sync",label:"Zakończony import",passed:facts.successfulCatalogSync,required:true,message:facts.successfulCatalogSync?"Ostatni import katalogu zakończony poprawnie":"Brak zakończonego importu katalogu",action:"sync"},
  {key:"background_jobs",label:"Operacje w tle",passed:facts.activeJobs===0,required:true,message:facts.activeJobs?`${facts.activeJobs} zadań nadal trwa lub oczekuje`:"Brak aktywnych zadań",action:"sync"},
  {key:"enrichment",label:"Dane techniczne",passed:!config.productPage.enabled||enrichment>=requirements.minimumEnrichmentPercent,required:config.productPage.enabled,message:config.productPage.enabled?`${enrichment}% produktów wzbogaconych; wymagane ${requirements.minimumEnrichmentPercent}%`:"Wzbogacanie wyłączone dla sklepu",action:"sync"},
  {key:"knowledge",label:"Baza wiedzy",passed:!requirements.requireKnowledgeSources||(config.knowledgeSources.length>0&&facts.knowledgeDocuments>=config.knowledgeSources.length),required:requirements.requireKnowledgeSources,message:config.knowledgeSources.length?`${facts.knowledgeDocuments}/${config.knowledgeSources.length} źródeł zsynchronizowanych`:"Nie skonfigurowano źródeł wiedzy",action:"knowledge"},
  {key:"quality",label:"Testy rozmów",passed:facts.qualityScenarios>=requirements.minimumQualityScenarios&&(!requirements.requireAllQualityPassing||facts.qualityPassed===facts.qualityScenarios),required:requirements.minimumQualityScenarios>0,message:`${facts.qualityPassed}/${facts.qualityScenarios} aktywnych scenariuszy zaliczonych; wymagane minimum ${requirements.minimumQualityScenarios}`,action:"quality"},
  {key:"limits",label:"Limity i koszty",passed:Boolean(config.aiLimits?.enabled&&config.aiLimits.dailyRequests>0&&config.aiLimits.monthlyTokens>0),required:true,message:config.aiLimits?.enabled?"Limity OpenAI są aktywne":"Limity OpenAI są wyłączone",action:"usage"},
  {key:"widget",label:"Konfiguracja widgetu",passed:Boolean(config.widget?.title&&config.widget.welcomeMessage&&config.widget.primaryColor),required:true,message:config.widget?.title?"Treści i wygląd widgetu są skonfigurowane":"Brakuje konfiguracji widgetu",action:"widget"},
  {key:"backup",label:"Odtwarzalna kopia bazy",passed:facts.backupFresh&&facts.backupVerified,required:true,message:!facts.backupFresh?"Brak aktualnej kopii zapasowej":facts.backupVerified?"Aktualna kopia przeszła próbne odtworzenie":"Aktualna kopia nie przeszła jeszcze próbnego odtworzenia",action:"backups"},
  {key:"privacy",label:"Prywatność i retencja",passed:Boolean(config.privacy?.conversationRetentionDays&&config.privacy.privacyNoticeUrl),required:true,message:config.privacy?.privacyNoticeUrl?`Historia: ${config.privacy.conversationHistoryEnabled?`${config.privacy.conversationRetentionDays} dni`:"wyłączona"}; polityka prywatności ustawiona`:"Brakuje publicznego adresu polityki prywatności",action:"privacy"},
];return{ready:checks.every(check=>!check.required||check.passed),published:config.widget?.enabled===true,checks,summary:{...facts,enrichmentPercent:enrichment}};}

export async function publicationReadiness(db:Database,config:StoreConfig){const[[productCount],[enrichedCount],[documentCount],[activeCount],[catalogSync],scenarios,[backup]]=await Promise.all([
  db.select({value:count()}).from(products).where(and(eq(products.storeId,config.id),eq(products.isActive,true))),
  db.select({value:count()}).from(products).where(and(eq(products.storeId,config.id),eq(products.isActive,true),eq(products.productPageStatus,"enriched"))),
  db.select({value:count()}).from(knowledgeDocuments).where(eq(knowledgeDocuments.storeId,config.id)),
  db.select({value:count()}).from(syncJobs).where(and(eq(syncJobs.storeId,config.id),inArray(syncJobs.status,["queued","running"]))),
  db.select({id:syncJobs.id}).from(syncJobs).where(and(eq(syncJobs.storeId,config.id),inArray(syncJobs.type,["feed","full"]),eq(syncJobs.status,"completed"))).orderBy(desc(syncJobs.finishedAt)).limit(1),
  db.select({id:qualityScenarios.id}).from(qualityScenarios).where(and(eq(qualityScenarios.storeId,config.id),eq(qualityScenarios.enabled,true))),
  db.select({metadata:runtimeHeartbeats.metadata,heartbeatAt:runtimeHeartbeats.heartbeatAt}).from(runtimeHeartbeats).where(eq(runtimeHeartbeats.component,"postgres-backup")).limit(1),
]);
  const latest=await Promise.all(scenarios.map(async scenario=>(await db.select({passed:qualityScenarioRuns.passed}).from(qualityScenarioRuns).where(eq(qualityScenarioRuns.scenarioId,scenario.id)).orderBy(desc(qualityScenarioRuns.createdAt)).limit(1))[0]));
  const intervalHours=Math.max(1,Number(process.env.BACKUP_INTERVAL_HOURS??24));
  const backupMetadata=(backup?.metadata??{}) as Record<string,unknown>;
  return evaluatePublication(config,{products:productCount?.value??0,enrichedProducts:enrichedCount?.value??0,knowledgeDocuments:documentCount?.value??0,activeJobs:activeCount?.value??0,successfulCatalogSync:Boolean(catalogSync),qualityScenarios:scenarios.length,qualityPassed:latest.filter(run=>run?.passed).length,backupFresh:Boolean(backup&&Date.now()-backup.heartbeatAt.getTime()<(intervalHours+1)*3_600_000),backupVerified:backupMetadata.verified===true});
}
