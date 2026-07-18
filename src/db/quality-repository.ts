import { and, desc, eq } from "drizzle-orm"; import type { Database } from "./client.js"; import { qualityScenarioRuns, qualityScenarios } from "./schema.js"; import type { QualityExpectations } from "../quality/evaluator.js";
export class QualityRepository { constructor(private db:Database){}
  list(storeId:string){return this.db.select().from(qualityScenarios).where(eq(qualityScenarios.storeId,storeId)).orderBy(desc(qualityScenarios.updatedAt));}
  async get(storeId:string,id:string){const [row]=await this.db.select().from(qualityScenarios).where(and(eq(qualityScenarios.storeId,storeId),eq(qualityScenarios.id,id))).limit(1);return row;}
  async create(input:{storeId:string;name:string;message:string;expectations:QualityExpectations}){const [row]=await this.db.insert(qualityScenarios).values(input).returning();return row!;}
  async update(storeId:string,id:string,input:{name:string;message:string;expectations:QualityExpectations;enabled:boolean}){const [row]=await this.db.update(qualityScenarios).set({...input,updatedAt:new Date()}).where(and(eq(qualityScenarios.storeId,storeId),eq(qualityScenarios.id,id))).returning();return row;}
  async remove(storeId:string,id:string){return this.db.delete(qualityScenarios).where(and(eq(qualityScenarios.storeId,storeId),eq(qualityScenarios.id,id)));}
  async record(scenarioId:string,passed:boolean,failures:string[],response:Record<string,unknown>){const meta=response.meta as any;const [row]=await this.db.insert(qualityScenarioRuns).values({scenarioId,passed,failures,response,inputTokens:(meta?.inputTokens||0)+(meta?.answerInputTokens||0),outputTokens:(meta?.outputTokens||0)+(meta?.answerOutputTokens||0)}).returning();return row!;}
}
