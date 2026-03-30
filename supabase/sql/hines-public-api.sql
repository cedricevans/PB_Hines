-- Public API wrappers for the Hines archive.
-- These let the frontend use the public PostgREST schema while the data stays in hines.
-- Run this after hines-family-schema.sql and hines-admin-workflow.sql

create schema if not exists hines;

create or replace view public.hines_branch_directory as
select
  tenants.slug as tenant_slug,
  branches.tenant_id,
  branches.id as branch_id,
  branches.slug as branch_slug,
  branches.display_name as branch_display_name,
  branches.tab_label,
  branches.tree_number,
  branches.sort_order,
  founder.id as founder_member_id,
  founder.display_name as founder_name,
  founder.dates_label as founder_dates_label,
  founder.biography as founder_biography,
  count(distinct members.id) as member_count,
  count(distinct education.id) as education_count
from hines.family_branches as branches
join public.tenants as tenants
  on tenants.id = branches.tenant_id
left join hines.family_members as founder
  on founder.id = branches.founder_member_id
left join hines.family_members as members
  on members.branch_id = branches.id
  and members.tenant_id = branches.tenant_id
left join hines.member_education_records as education
  on education.branch_id = branches.id
  and education.tenant_id = branches.tenant_id
group by
  tenants.slug,
  branches.tenant_id,
  branches.id,
  branches.slug,
  branches.display_name,
  branches.tab_label,
  branches.tree_number,
  branches.sort_order,
  founder.id,
  founder.display_name,
  founder.dates_label,
  founder.biography;

create or replace view public.hines_member_directory as
select
  tenants.slug as tenant_slug,
  members.tenant_id,
  members.id as member_id,
  members.branch_id,
  branches.slug as branch_slug,
  members.display_name,
  members.dates_label,
  members.is_branch_founder,
  members.generation_level,
  members.relation_to_root,
  rel.parent_member_id,
  members.metadata ->> 'co_parent_label' as co_parent_label
from hines.family_members as members
join public.tenants as tenants
  on tenants.id = members.tenant_id
left join hines.family_branches as branches
  on branches.id = members.branch_id
left join hines.member_relationships as rel
  on rel.child_member_id = members.id
  and rel.relation_type = 'parent_child'
  and rel.tenant_id = members.tenant_id;

create or replace view public.hines_education_feed as
select
  tenants.slug as tenant_slug,
  education.tenant_id,
  education.id,
  education.branch_id,
  branches.slug as branch_slug,
  branches.display_name as branch_display_name,
  education.member_id,
  education.member_name,
  education.credential_summary,
  education.graduation_year,
  education.raw_text,
  education.sort_order
from hines.member_education_records as education
join public.tenants as tenants
  on tenants.id = education.tenant_id
left join hines.family_branches as branches
  on branches.id = education.branch_id;

grant select on public.hines_branch_directory to anon, authenticated;
grant select on public.hines_member_directory to anon, authenticated;
grant select on public.hines_education_feed to anon, authenticated;

create or replace function public.hines_is_current_user_admin(target_tenant_slug text default 'hines')
returns boolean
language sql
stable
security definer
set search_path = public, auth, hines
as $$
  select hines.is_tenant_admin(tenants.id)
  from public.tenants as tenants
  where tenants.slug = target_tenant_slug
  limit 1;
$$;

create or replace function public.hines_submit_update_request(
  target_tenant_slug text default 'hines',
  branch_id uuid default null,
  member_id uuid default null,
  request_type text default 'member_edit',
  requester_name text default null,
  requester_email text default null,
  requester_phone text default null,
  relationship_to_family text default null,
  subject text default null,
  message text default null,
  proposed_payload jsonb default '{}'::jsonb,
  evidence_urls jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, hines
as $$
declare
  v_tenant_id uuid;
  v_request_id uuid;
begin
  select id
  into v_tenant_id
  from public.tenants
  where slug = target_tenant_slug
  limit 1;

  if v_tenant_id is null then
    raise exception 'Tenant % was not found.', target_tenant_slug;
  end if;

  insert into hines.family_update_requests (
    tenant_id,
    branch_id,
    member_id,
    submitted_by,
    request_type,
    requester_name,
    requester_email,
    requester_phone,
    relationship_to_family,
    subject,
    message,
    proposed_payload,
    evidence_urls
  )
  values (
    v_tenant_id,
    branch_id,
    member_id,
    auth.uid(),
    request_type,
    coalesce(nullif(requester_name, ''), 'Unknown requester'),
    coalesce(nullif(requester_email, ''), 'unknown@example.com'),
    nullif(requester_phone, ''),
    nullif(relationship_to_family, ''),
    coalesce(nullif(subject, ''), 'Family update request'),
    nullif(message, ''),
    coalesce(proposed_payload, '{}'::jsonb),
    coalesce(evidence_urls, '[]'::jsonb)
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.hines_list_update_requests(target_tenant_slug text default 'hines')
returns table (
  id uuid,
  tenant_id uuid,
  branch_id uuid,
  branch_name text,
  member_id uuid,
  request_type text,
  requester_name text,
  requester_email text,
  subject text,
  status text,
  created_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  admin_notes text,
  proposed_payload jsonb
)
language sql
stable
security definer
set search_path = public, auth, hines
as $$
  select
    requests.id,
    requests.tenant_id,
    requests.branch_id,
    branches.display_name as branch_name,
    requests.member_id,
    requests.request_type,
    requests.requester_name,
    requests.requester_email,
    requests.subject,
    requests.status,
    requests.created_at,
    requests.reviewed_at,
    requests.admin_notes,
    requests.proposed_payload
  from hines.family_update_requests as requests
  left join hines.family_branches as branches
    on branches.id = requests.branch_id
  where requests.tenant_id = (
    select id
    from public.tenants
    where slug = target_tenant_slug
    limit 1
  )
    and hines.is_tenant_admin(requests.tenant_id)
  order by requests.created_at desc;
$$;

create or replace function public.hines_review_update_request(
  target_request_id uuid,
  next_status text,
  admin_note text default null
)
returns jsonb
language sql
security definer
set search_path = public, auth, hines
as $$
  select to_jsonb(reviewed_row)
  from hines.review_family_update_request(target_request_id, next_status, admin_note) as reviewed_row;
$$;

create or replace function public.hines_apply_update_request(
  target_request_id uuid,
  admin_note text default null
)
returns jsonb
language sql
security definer
set search_path = public, auth, hines
as $$
  select hines.apply_family_update_request(target_request_id, admin_note);
$$;

grant execute on function public.hines_is_current_user_admin(text) to anon, authenticated;
grant execute on function public.hines_submit_update_request(text, uuid, uuid, text, text, text, text, text, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.hines_list_update_requests(text) to authenticated;
grant execute on function public.hines_review_update_request(uuid, text, text) to authenticated;
grant execute on function public.hines_apply_update_request(uuid, text) to authenticated;
