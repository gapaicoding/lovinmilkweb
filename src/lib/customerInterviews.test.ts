import {describe,expect,it} from "vitest";
import {indonesianDayName,orderAnswers,type InterviewQuestion} from "./customerInterviews";
describe("parent interview domain",()=>{
 it("derives Hari without UTC date shifting",()=>expect(indonesianDayName("2026-09-01")).toBe("Selasa"));
 it("submits dynamic answers in question order",()=>{const q=[{id:"b",sort_order:2},{id:"a",sort_order:1}] as InterviewQuestion[];expect(orderAnswers(q,{a:" first ",b:""})).toEqual([{question_id:"a",answer_text:"first"},{question_id:"b",answer_text:null}]);});
});
