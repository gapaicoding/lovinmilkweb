begin;

-- Keep the shared resolver private; expose only the equality check required by Interview RLS.
create or replace function public.lm_is_current_customer_interview_outlet(p_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select p_outlet_id is not null
    and p_outlet_id = public.lm_resolve_sales_outlet(null);
$$;

revoke all on function public.lm_is_current_customer_interview_outlet(uuid)
from public, anon, authenticated;
grant execute on function public.lm_is_current_customer_interview_outlet(uuid)
to authenticated, service_role;

drop policy if exists interview_versions_read_staff on public.customer_interview_form_versions;
create policy interview_versions_read_staff on public.customer_interview_form_versions
for select to authenticated using (
  public.lm_is_active_staff_or_above()
  and public.lm_is_current_customer_interview_outlet(outlet_id)
);

drop policy if exists interview_questions_read_staff on public.customer_interview_questions;
create policy interview_questions_read_staff on public.customer_interview_questions
for select to authenticated using (
  public.lm_is_active_staff_or_above()
  and exists (
    select 1 from public.customer_interview_form_versions f
    where f.id = form_version_id
      and public.lm_is_current_customer_interview_outlet(f.outlet_id)
  )
);

drop policy if exists interviews_read_staff on public.customer_interviews;
create policy interviews_read_staff on public.customer_interviews
for select to authenticated using (
  public.lm_is_active_staff_or_above()
  and public.lm_is_current_customer_interview_outlet(outlet_id)
);

drop policy if exists interview_answers_read_staff on public.customer_interview_answers;
create policy interview_answers_read_staff on public.customer_interview_answers
for select to authenticated using (
  public.lm_is_active_staff_or_above()
  and exists (
    select 1 from public.customer_interviews i
    where i.id = interview_id
      and public.lm_is_current_customer_interview_outlet(i.outlet_id)
  )
);

commit;
