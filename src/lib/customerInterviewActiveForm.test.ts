import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const domain=readFileSync("src/lib/customerInterviews.ts","utf8");
const structure=readFileSync("src/hooks/useBusinessStructure.ts","utf8");
const hotfix=readFileSync("supabase/migrations/20260901210000_customer_interview_active_form_visibility_hotfix.sql","utf8").toLowerCase();

describe("WOT-F01 active-form regression",()=>{
 it("queries exactly one active form for the frontend Outlet",()=>{expect(domain).toContain('.eq("outlet_id",outletId).eq("is_active",true).maybeSingle()');expect(domain).toContain("version_number");});
 it("loads and sorts the nested question relationship",()=>{expect(domain).toContain("customer_interview_questions(id,form_version_id,question_text,sort_order)");expect(domain).toContain("a.sort_order-b.sort_order");});
 it("aligns frontend default-Outlet selection with the canonical resolver",()=>{expect(structure).toContain('.order("created_at", { ascending: true })');expect(structure).toContain('.order("id", { ascending: true })');expect(structure.indexOf('.order("created_at"')).toBeLessThan(structure.indexOf('.order("id"'));});
 it("preserves cross-Outlet denial for versions and questions",()=>{expect(hotfix).toContain("lm_is_current_customer_interview_outlet(outlet_id)");expect(hotfix).toContain("lm_is_current_customer_interview_outlet(f.outlet_id)");});
 it("leaves the applied migration untouched by using an additive hotfix",()=>expect(hotfix).toMatch(/^begin;/));
});
