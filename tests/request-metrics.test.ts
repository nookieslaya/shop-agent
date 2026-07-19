import { describe,expect,it } from "vitest";
import { defaultObservability, percentile, summarizeRequestMetrics } from "../src/observability/request-metrics.js";
const row=(latencyMs:number,statusCode=200,route="/v1/chat")=>({requestId:crypto.randomUUID(),method:"POST",route,statusCode,latencyMs,errorCode:statusCode>=500?"HTTP_500":null,createdAt:new Date()});
describe("request telemetry",()=>{
  it("calculates nearest-rank percentiles",()=>expect(percentile([10,20,30,40,50],.95)).toBe(50));
  it("raises deterministic alerts only after the configured sample minimum",()=>{const config={...defaultObservability,minimumRequestsForAlert:4,errorRateAlertPercent:20,p95AlertMs:100};const result=summarizeRequestMetrics([row(20),row(30),row(200),row(250,500)],config);expect(result.summary).toMatchObject({requests:4,errors:1,errorRate:25,p95Ms:250});expect(result.alerts.map(alert=>alert.key)).toEqual(["error_rate","latency_p95"])});
  it("does not alert on a tiny sample",()=>expect(summarizeRequestMetrics([row(9000,500)],defaultObservability).alerts).toEqual([]));
});
