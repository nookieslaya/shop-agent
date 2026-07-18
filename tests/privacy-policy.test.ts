import { describe,expect,it } from "vitest";
import { storeConfigSchema } from "../src/config/store.js";
import { redactConversationData } from "../src/conversation/history.js";

describe("privacy policy",()=>{
  it("masks contact data recursively before persistence or export",()=>{expect(redactConversationData({message:"radek@example.com, +48 500 600 700",nested:{phone:"500-600-700"}})).toEqual({message:"[EMAIL], [TELEFON]",nested:{phone:"[TELEFON]"}})});
  it("validates per-store retention boundaries",()=>{const base={schemaVersion:1,id:"demo",name:"Demo",feed:{type:"google_xml",url:"https://example.com/feed.xml"},productPage:{enabled:false,specificationRowSelector:"table tr"},knowledgeSources:[]};expect(storeConfigSchema.parse({...base,privacy:{conversationHistoryEnabled:true,conversationRetentionDays:90,allowAdminExport:true}}).privacy?.conversationRetentionDays).toBe(90);expect(()=>storeConfigSchema.parse({...base,privacy:{conversationHistoryEnabled:true,conversationRetentionDays:0,allowAdminExport:true}})).toThrow()});
});
