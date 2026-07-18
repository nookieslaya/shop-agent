import { describe,expect,it } from "vitest";
import { FixedWindowRateLimiter } from "../src/observability/rate-limit.js";
import { storeConfigSchema } from "../src/config/store.js";

describe("production safeguards",()=>{
  it("enforces a fixed request window and reports retry time",()=>{const limiter=new FixedWindowRateLimiter();expect(limiter.consume("store:ip",2,0).allowed).toBe(true);expect(limiter.consume("store:ip",2,1).allowed).toBe(true);expect(limiter.consume("store:ip",2,2)).toEqual({allowed:false,retryAfterSeconds:60});expect(limiter.consume("store:ip",2,60_000).allowed).toBe(true);});
  it("validates portable per-store AI limits",()=>{const parsed=storeConfigSchema.safeParse({schemaVersion:1,id:"demo",name:"Demo",feed:{type:"google_xml",url:"https://example.com/feed.xml"},productPage:{enabled:false,specificationRowSelector:"table tr"},knowledgeSources:[],aiLimits:{enabled:true,requestsPerMinute:10,dailyRequests:100,monthlyTokens:10000,maximumMessageCharacters:1000,alertPercent:80,inputCostUsdPerMillionTokens:0.1,outputCostUsdPerMillionTokens:0.4,limitMessage:"Limit"}});expect(parsed.success).toBe(true);});
});
