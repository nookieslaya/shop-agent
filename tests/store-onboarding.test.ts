import { describe,expect,it } from "vitest";
import { buildStoreConfig, onboardingStoreSchema } from "../src/onboarding/store-onboarding.js";
import { assertSafePublicUrl } from "../src/security/public-url.js";

describe("store onboarding",()=>{
  const input={id:"demo-store",name:"Demo Store",feedUrl:"https://example.com/feed.xml",locale:"en-GB",productPage:{enabled:false,specificationRowSelector:"table tr"},knowledgeSources:[{type:"html" as const,topic:"returns",url:"https://example.com/returns"}],startImport:true};
  it("builds a portable disabled-by-default widget configuration",()=>{const config=buildStoreConfig(onboardingStoreSchema.parse(input));expect(config.id).toBe("demo-store");expect(config.widget?.enabled).toBe(false);expect(config.knowledgeRetrieval?.topicAliases).toEqual({returns:["returns"]});expect(config.productComparison?.fields[0]?.id).toBe("price");});
  it("rejects invalid stable store identifiers",()=>{expect(onboardingStoreSchema.safeParse({...input,id:"Demo Store"}).success).toBe(false);});
  it("blocks local, credentialed and unsupported source URLs",async()=>{await expect(assertSafePublicUrl("http://127.0.0.1/feed")).rejects.toThrow(/private|local/);await expect(assertSafePublicUrl("https://user:pass@example.com/feed")).rejects.toThrow(/credentials/);await expect(assertSafePublicUrl("file:///etc/passwd")).rejects.toThrow(/HTTP/);});
});
