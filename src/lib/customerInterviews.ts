import { supabase } from "@/integrations/supabase/client";

export interface InterviewQuestion { id:string; form_version_id:string; question_text:string; sort_order:number }
export interface InterviewFormVersion { id:string; outlet_id:string; version_number:number; is_active:boolean; questions:InterviewQuestion[] }
export interface InterviewAnswer { question_id:string; answer_text:string|null }
export interface CustomerInterview { id:string; outlet_id:string; interview_date:string; visit_time:string; form_version_id:string; inputter_name:string; inputter_session_id:string; created_at:string; updated_at:string; customer_interview_form_versions:{version_number:number;customer_interview_questions:InterviewQuestion[]};customer_interview_answers:InterviewAnswer[] }
export interface InterviewWritePayload { interviewDate:string; visitTime:string; answers:InterviewAnswer[] }

// New additive tables are accessed through this narrow adapter until the next
// full generated-type refresh; RPC signatures are already recorded locally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db=supabase as any;
export const INDONESIAN_DAYS=["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"] as const;
export function indonesianDayName(dateOnly:string):string { const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);if(!m) return "—";const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return INDONESIAN_DAYS[d.getUTCDay()]; }
export function orderAnswers(questions:InterviewQuestion[],answers:Record<string,string>):InterviewAnswer[]{return [...questions].sort((a,b)=>a.sort_order-b.sort_order).map(q=>({question_id:q.id,answer_text:answers[q.id]?.trim()||null}));}
export async function fetchActiveInterviewForm(outletId:string):Promise<InterviewFormVersion>{const {data,error}=await db.from("customer_interview_form_versions").select("id,outlet_id,version_number,is_active,customer_interview_questions(id,form_version_id,question_text,sort_order)").eq("outlet_id",outletId).eq("is_active",true).maybeSingle();if(error)throw error;if(!data)throw new Error("Formulir wawancara aktif tidak ditemukan atau tidak dapat diakses.");return {...data,questions:[...(data.customer_interview_questions??[])].sort((a:InterviewQuestion,b:InterviewQuestion)=>a.sort_order-b.sort_order)};}
export async function fetchInterviews(outletId:string,month:string):Promise<CustomerInterview[]>{const start=`${month}-01`,end=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10);const {data,error}=await db.from("customer_interviews").select("*,customer_interview_form_versions(version_number,customer_interview_questions(id,form_version_id,question_text,sort_order)),customer_interview_answers(question_id,answer_text)").eq("outlet_id",outletId).gte("interview_date",start).lte("interview_date",end).order("interview_date",{ascending:false}).order("visit_time",{ascending:false});if(error)throw error;return data??[];}
export async function createInterview(outletId:string,inputterSessionId:string,p:InterviewWritePayload){const {data,error}=await db.rpc("create_customer_interview",{p_interview_date:p.interviewDate,p_visit_time:p.visitTime,p_answers:p.answers,p_inputter_session_id:inputterSessionId,p_outlet_id:outletId});if(error)throw error;return data as string;}
export async function updateInterview(id:string,p:InterviewWritePayload){const {data,error}=await db.rpc("update_customer_interview",{p_interview_id:id,p_interview_date:p.interviewDate,p_visit_time:p.visitTime,p_answers:p.answers});if(error)throw error;return data as string;}
export async function publishInterviewForm(outletId:string,questions:string[]){const {data,error}=await db.rpc("publish_customer_interview_form_version",{p_questions:questions.map(question_text=>({question_text})),p_outlet_id:outletId});if(error)throw error;return data;}
