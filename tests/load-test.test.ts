import { describe,expect,it } from "vitest";
import { loadTestReport } from "../src/observability/load-test-report.js";
describe("load report",()=>it("summarizes throughput and latency",()=>expect(loadTestReport([10,20,30,40],1,1000)).toEqual({requests:4,successes:3,errors:1,requestsPerSecond:4,latencyMs:{p50:20,p95:40,p99:40,max:40}})));
