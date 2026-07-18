import { describe,expect,it } from "vitest";
import { buildStoreConfig, onboardingStoreSchema } from "../src/onboarding/store-onboarding.js";
import { evaluatePublication } from "../src/publication/readiness.js";

const config=buildStoreConfig(onboardingStoreSchema.parse({id:"demo",name:"Demo",feedUrl:"https://example.com/feed.xml",locale:"pl-PL",productPage:{enabled:true,specificationRowSelector:"table tr"},knowledgeSources:[{type:"html",topic:"returns",url:"https://example.com/returns"}],startImport:true}));
describe("publication readiness",()=>{
  it("blocks publication and provides actionable failed checks",()=>{const result=evaluatePublication(config,{products:0,enrichedProducts:0,knowledgeDocuments:0,activeJobs:1,successfulCatalogSync:false,qualityScenarios:0,qualityPassed:0});expect(result.ready).toBe(false);expect(result.checks.filter(item=>item.required&&!item.passed).map(item=>item.key)).toContain("catalog");expect(result.checks.find(item=>item.key==="catalog")?.action).toBe("sync");});
  it("passes only after catalog, enrichment, knowledge, quality and limits are ready",()=>{const result=evaluatePublication(config,{products:100,enrichedProducts:80,knowledgeDocuments:1,activeJobs:0,successfulCatalogSync:true,qualityScenarios:3,qualityPassed:3});expect(result.ready).toBe(true);expect(result.published).toBe(false);});
  it("respects per-store optional knowledge and quality requirements",()=>{const relaxed={...config,publicationRequirements:{minimumProducts:1,minimumEnrichmentPercent:0,requireKnowledgeSources:false,minimumQualityScenarios:0,requireAllQualityPassing:false},productPage:{...config.productPage,enabled:false},knowledgeSources:[]};expect(evaluatePublication(relaxed,{products:1,enrichedProducts:0,knowledgeDocuments:0,activeJobs:0,successfulCatalogSync:true,qualityScenarios:0,qualityPassed:0}).ready).toBe(true);});
});
