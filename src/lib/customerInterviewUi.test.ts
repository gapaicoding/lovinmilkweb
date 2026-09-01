import {readFileSync} from "node:fs";import {describe,expect,it} from "vitest";
const ui=readFileSync("src/components/interviews/CustomerInterviewManager.tsx","utf8"),domain=readFileSync("src/lib/customerInterviews.ts","utf8"),inputter=readFileSync("src/lib/operationalInputter.ts","utf8");
describe("parent interview UI regression contract",()=>{
 it("renders active questions dynamically",()=>expect(ui).toContain("questions.map"));
 it("shows all fixed August metadata",()=>{for(const label of ["Hari","Tanggal","Nama Pelaksana Tugas","Jam Berkunjung (WIB)"])expect(ui).toContain(label);});
 it("keeps inputter read-only",()=>expect(ui).toContain('<Input readOnly value={historicalName}'));
 it("blocks create while Interview inputter is missing",()=>{expect(ui).toContain("disabled={!inputter.name||!form.data}");expect(ui).toContain("Atur nama penginput terlebih dahulu.");});
 it("uses the historical question relationship for detail and edit",()=>expect(ui).toContain("value.customer_interview_form_versions.customer_interview_questions"));
 it("supports adding a draft question",()=>expect(ui).toContain('setDraft(a=>[...a,""])'));
 it("supports editing a draft question",()=>expect(ui).toContain("x===i?e.target.value:v"));
 it("supports removing a draft question",()=>expect(ui).toContain("a.filter((_,x)=>x!==i)"));
 it("supports reordering draft questions",()=>{expect(ui).toContain("move(i,-1)");expect(ui).toContain("move(i,1)");});
 it("publishes rather than directly updating questions",()=>{expect(domain).toContain('rpc("publish_customer_interview_form_version"');expect(domain).not.toContain('.from("customer_interview_questions").update');});
 it("allows Staff-visible configuration without client-only admin gate",()=>{expect(ui).toContain('<TabsTrigger value="questions">Atur Pertanyaan</TabsTrigger>');expect(ui).not.toContain("isAdmin");});
 it("retains history independently of the active form",()=>expect(domain).toContain("customer_interview_form_versions(version_number,customer_interview_questions"));
 it("uses a distinct browser-session inputter section",()=>expect(inputter).toContain('"interviews"'));
 it("does not integrate ordered menu with Sales",()=>{expect(ui.toLowerCase()).not.toContain("sales_transaction");expect(domain.toLowerCase()).not.toContain("sales_transaction");});
});
