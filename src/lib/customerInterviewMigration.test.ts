import {readFileSync} from "node:fs";import {describe,expect,it} from "vitest";
const sql=readFileSync("supabase/migrations/20260901190000_customer_parent_interviews.sql","utf8").toLowerCase();
describe("parent interview migration",()=>{
 it("seeds exactly eight August questions in stable order",()=>{const seed=sql.match(/insert into public\.customer_interview_questions\(form_version_id,sort_order,question_text\) values([\s\S]*?);/)?.[1]??"";expect(seed.match(/\(v_version,\d,/g)).toHaveLength(8);for(let i=1;i<=8;i++)expect(seed).toContain(`(v_version,${i},`);});
 it("uses immutable versioned tables and one active version",()=>{expect(sql).toContain("customer_interview_one_active_version");expect(sql).toContain("customer_interview_questions_immutable");expect(sql).toContain("form_version_id uuid not null");});
 it("rejects cross-version answers and blank or zero-question publications",()=>{expect(sql).toContain("v_interview_version<>v_question_version");expect(sql).toContain("minimal satu pertanyaan");expect(sql).toContain("pertanyaan kosong atau terlalu panjang");});
 it("authorizes Staff, Admin and Super Admin",()=>expect(sql).toContain("array['staff','admin','super_admin']"));
 it("requires and snapshots an independent Interview inputter",()=>{expect(sql).toContain("'interviews'");expect(sql).toContain("v_session.inputter_name");expect(sql).toContain("v_session.session_id");});
 it("preserves creator and version attribution during edits",()=>{const update=sql.slice(sql.indexOf("create function public.update_customer_interview"),sql.indexOf("-- extend v3"));expect(update).not.toContain("inputter_name=");expect(update).not.toContain("form_version_id=");});
 it("contains no Sales relationship for ordered menu",()=>{expect(sql).not.toContain("sales_transaction_id");});
 it("creates new interviews against the active version",()=>expect(sql).toContain("where outlet_id=v_session.outlet_id and is_active"));
 it("serializes concurrent publication",()=>expect(sql).toContain("pg_advisory_xact_lock"));
 it("increments versions on the server",()=>expect(sql).toContain("coalesce(max(f.version_number),0)+1"));
 it("publishes atomically inside the migration transaction",()=>{expect(sql.startsWith("begin;")).toBe(true);expect(sql.trimEnd().endsWith("commit;")).toBe(true);});
 it("allows outlet-scoped read-only RLS access for active Staff+",()=>{expect(sql.match(/for select to authenticated using\(public\.lm_is_active_staff_or_above\(\) and/g)).toHaveLength(4);});
 it("revokes direct authenticated writes",()=>expect(sql).toContain("revoke all on public.customer_interview_form_versions"));
 it("does not expose hard-delete RPCs",()=>expect(sql).not.toMatch(/function public\.(delete|archive)_customer_interview/));
 it("does not import historical workbook rows",()=>expect(sql).not.toContain("februari 2026"));
});
