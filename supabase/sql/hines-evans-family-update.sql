-- Evans family update: move Imani Evans and JC Evans under Cedric Evans
-- Cedric Evans     → gen 3 (3d03ae20-eea5-449d-8f58-54fe9930b0f7)
-- Imani Evans      → gen 4, child of Cedric (340e3dff-ca50-4898-8650-c641763fb86e)
-- JC Evans         → gen 4, child of Cedric (beb61120-a3a1-4975-83ee-07254712ad3f)

-- 1. Promote Imani and JC to generation 4
update hines.family_members
set generation_level = 4
where id in (
  '340e3dff-ca50-4898-8650-c641763fb86e', -- Imani Evans
  'beb61120-a3a1-4975-83ee-07254712ad3f'  -- JC Evans
);

-- 2. Link Imani and JC as children of Cedric Evans
insert into hines.member_relationships (
  tenant_id,
  branch_id,
  parent_member_id,
  child_member_id,
  relation_type,
  is_verified,
  source
)
select
  m.tenant_id,
  m.branch_id,
  '3d03ae20-eea5-449d-8f58-54fe9930b0f7'::uuid, -- Cedric Evans
  m.id,
  'parent_child',
  true,
  'admin_direct'
from hines.family_members m
where m.id in (
  '340e3dff-ca50-4898-8650-c641763fb86e', -- Imani Evans
  'beb61120-a3a1-4975-83ee-07254712ad3f'  -- JC Evans
)
on conflict (tenant_id, parent_member_id, child_member_id, relation_type) do nothing;

-- 9. Education record: Cedric Evans — University of Florida
insert into hines.member_education_records (
  tenant_id,
  branch_id,
  member_id,
  member_name,
  credential_summary,
  raw_text,
  sort_order,
  source
)
select
  m.tenant_id,
  m.branch_id,
  m.id,
  m.display_name,
  'University of Florida',
  'Cedric Evans  University of Florida',
  coalesce(
    (select max(e.sort_order) from hines.member_education_records e where e.branch_id = m.branch_id),
    0
  ) + 3,
  'admin_direct'
from hines.family_members m
where m.slug = 'member-johnny-cedric-evans'
on conflict do nothing;

-- 10. Education record: Danelle Bythwood — University of Miami
insert into hines.member_education_records (
  tenant_id,
  branch_id,
  member_id,
  member_name,
  credential_summary,
  raw_text,
  sort_order,
  source
)
select
  m.tenant_id,
  m.branch_id,
  m.id,
  m.display_name,
  'Western Michigan University',
  'Danelle Bythwood  Western Michigan University',
  coalesce(
    (select max(e.sort_order) from hines.member_education_records e where e.branch_id = m.branch_id),
    0
  ) + 4,
  'admin_direct'
from hines.family_members m
where m.slug = 'member-johnny-danelle-bythwood'
on conflict do nothing;

-- 11. Education record: Daniel Bythwood — University of Nevada
insert into hines.member_education_records (
  tenant_id,
  branch_id,
  member_id,
  member_name,
  credential_summary,
  raw_text,
  sort_order,
  source
)
select
  m.tenant_id,
  m.branch_id,
  m.id,
  m.display_name,
  'University of Nevada',
  'Daniel Bythwood  University of Nevada',
  coalesce(
    (select max(e.sort_order) from hines.member_education_records e where e.branch_id = m.branch_id),
    0
  ) + 5,
  'admin_direct'
from hines.family_members m
where m.slug = 'member-johnny-daniel-bythwood'
on conflict do nothing;

-- 12. Education record: Danyla Bythwood — University of Florida
insert into hines.member_education_records (
  tenant_id,
  branch_id,
  member_id,
  member_name,
  credential_summary,
  raw_text,
  sort_order,
  source
)
select
  m.tenant_id,
  m.branch_id,
  m.id,
  m.display_name,
  'University of Florida',
  'Danyla Bythwood  University of Florida',
  coalesce(
    (select max(e.sort_order) from hines.member_education_records e where e.branch_id = m.branch_id),
    0
  ) + 6,
  'admin_direct'
from hines.family_members m
where m.slug = 'member-johnny-danyla-bythwood'
on conflict do nothing;

-- 13. Education record: Kia Evans — VCU Richmond
insert into hines.member_education_records (
  tenant_id,
  branch_id,
  member_id,
  member_name,
  credential_summary,
  raw_text,
  sort_order,
  source
)
select
  m.tenant_id,
  m.branch_id,
  m.id,
  m.display_name,
  'VCU Richmond',
  'Kia Evans  VCU Richmond',
  coalesce(
    (select max(e.sort_order) from hines.member_education_records e where e.branch_id = m.branch_id),
    0
  ) + 7,
  'admin_direct'
from hines.family_members m
where m.slug = 'member-johnny-kia-evans'
on conflict do nothing;

-- 3. Education record: Imani Evans — Vanderbilt University graduate
insert into hines.member_education_records (
  tenant_id,
  branch_id,
  member_id,
  member_name,
  credential_summary,
  raw_text,
  sort_order,
  source
)
select
  m.tenant_id,
  m.branch_id,
  m.id,
  m.display_name,
  'Graduate, Vanderbilt University',
  'Imani Evans  Graduate, Vanderbilt University',
  coalesce(
    (select max(e.sort_order) from hines.member_education_records e where e.branch_id = m.branch_id),
    0
  ) + 1,
  'admin_direct'
from hines.family_members m
where m.id = '340e3dff-ca50-4898-8650-c641763fb86e'
on conflict do nothing;

-- 4. Education record: JC Evans — James Madison University (Quarterback)
insert into hines.member_education_records (
  tenant_id,
  branch_id,
  member_id,
  member_name,
  credential_summary,
  raw_text,
  sort_order,
  source
)
select
  m.tenant_id,
  m.branch_id,
  m.id,
  m.display_name,
  'Student, James Madison University · Quarterback',
  'JC Evans  Student, James Madison University · Quarterback',
  coalesce(
    (select max(e.sort_order) from hines.member_education_records e where e.branch_id = m.branch_id),
    0
  ) + 2,
  'admin_direct'
from hines.family_members m
where m.id = 'beb61120-a3a1-4975-83ee-07254712ad3f'
on conflict do nothing;

-- 5. Promote Farrell and Danelle descendant lines to generation 4
update hines.family_members
set generation_level = 4
where slug in (
  'member-johnny-kia-evans',
  'member-johnny-savannah-evans',
  'member-johnny-farrell-evans-jr',
  'member-johnny-fredrick-evans',
  'member-johnny-danyla-bythwood',
  'member-johnny-dyasia-bythwood'
);

-- 6. Add missing descendants for the Johnny Hines branch
insert into hines.family_members (
  tenant_id,
  slug,
  branch_id,
  full_name,
  display_name,
  relation_to_root,
  generation_level,
  birth_label,
  death_label,
  dates_label,
  biography,
  quote_text,
  quote_attribution,
  is_branch_founder,
  is_living,
  metadata
)
values
(
  (select id from public.tenants where slug = 'hines'),
  'member-johnny-delieia-bythwood',
  (select id from hines.family_branches where tenant_id = (select id from public.tenants where slug = 'hines') and slug = 'johnny'),
  'Delieia Bythwood',
  'Delieia Bythwood',
  'descendant',
  4,
  null,
  null,
  null,
  '[]'::jsonb,
  null,
  null,
  false,
  true,
  '{"source":"admin_direct","family_line":"danelle-bythwood"}'::jsonb
),
(
  (select id from public.tenants where slug = 'hines'),
  'member-johnny-trishan-evans',
  (select id from hines.family_branches where tenant_id = (select id from public.tenants where slug = 'hines') and slug = 'johnny'),
  'Trishan Evans',
  'Trishan Evans',
  'descendant',
  4,
  null,
  null,
  null,
  '[]'::jsonb,
  null,
  null,
  false,
  true,
  '{"source":"admin_direct","family_line":"farrell-evans"}'::jsonb
),
(
  (select id from public.tenants where slug = 'hines'),
  'member-johnny-tristen-evans',
  (select id from hines.family_branches where tenant_id = (select id from public.tenants where slug = 'hines') and slug = 'johnny'),
  'Tristen Evans',
  'Tristen Evans',
  'descendant',
  4,
  null,
  null,
  null,
  '[]'::jsonb,
  null,
  null,
  false,
  true,
  '{"source":"admin_direct","family_line":"farrell-evans"}'::jsonb
)
on conflict (tenant_id, slug) do nothing;

-- 7. Link Farrell Evans to his children
insert into hines.member_relationships (
  tenant_id,
  branch_id,
  parent_member_id,
  child_member_id,
  relation_type,
  is_verified,
  source
)
select
  parent.tenant_id,
  parent.branch_id,
  parent.id,
  child.id,
  'parent_child',
  true,
  'admin_direct'
from hines.family_members as parent
join hines.family_members as child
  on child.tenant_id = parent.tenant_id
where parent.slug = 'member-johnny-farrell-evans'
  and child.slug in (
    'member-johnny-kia-evans',
    'member-johnny-savannah-evans',
    'member-johnny-farrell-evans-jr',
    'member-johnny-fredrick-evans',
    'member-johnny-trishan-evans',
    'member-johnny-tristen-evans'
  )
on conflict (tenant_id, parent_member_id, child_member_id, relation_type) do nothing;

-- 8. Link Danelle Bythwood to her children
insert into hines.member_relationships (
  tenant_id,
  branch_id,
  parent_member_id,
  child_member_id,
  relation_type,
  is_verified,
  source
)
select
  parent.tenant_id,
  parent.branch_id,
  parent.id,
  child.id,
  'parent_child',
  true,
  'admin_direct'
from hines.family_members as parent
join hines.family_members as child
  on child.tenant_id = parent.tenant_id
where parent.slug = 'member-johnny-danelle-bythwood'
  and child.slug in (
    'member-johnny-danyla-bythwood',
    'member-johnny-dyasia-bythwood',
    'member-johnny-delieia-bythwood'
  )
on conflict (tenant_id, parent_member_id, child_member_id, relation_type) do nothing;

-- 14. Optional co-parent labels for children whose parents want both listed
update hines.family_members
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('co_parent_label', 'Cedric + Nia Evans')
where slug in (
  'member-johnny-imani-evans',
  'member-johnny-jc-evans'
);

update hines.family_members
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('co_parent_label', 'Farrell + Heather')
where slug in (
  'member-johnny-savannah-evans',
  'member-johnny-farrell-evans-jr'
);

-- 15. Add Dinavon Bythwood under Elouise Hines Bythwood
insert into hines.family_members (
  tenant_id,
  slug,
  branch_id,
  full_name,
  display_name,
  relation_to_root,
  generation_level,
  birth_label,
  death_label,
  dates_label,
  biography,
  quote_text,
  quote_attribution,
  is_branch_founder,
  is_living,
  metadata
)
values (
  (select id from public.tenants where slug = 'hines'),
  'member-johnny-dinavon-bythwood',
  (select id from hines.family_branches where tenant_id = (select id from public.tenants where slug = 'hines') and slug = 'johnny'),
  'Dinavon Bythwood',
  'Dinavon Bythwood',
  'descendant',
  3,
  null,
  null,
  null,
  '[]'::jsonb,
  null,
  null,
  false,
  true,
  '{"source":"admin_direct","family_line":"elouise-bythwood"}'::jsonb
)
on conflict (tenant_id, slug) do nothing;

-- 16. Link Elouise Hines Bythwood to Dinavon Bythwood
insert into hines.member_relationships (
  tenant_id,
  branch_id,
  parent_member_id,
  child_member_id,
  relation_type,
  is_verified,
  source
)
select
  parent.tenant_id,
  parent.branch_id,
  parent.id,
  child.id,
  'parent_child',
  true,
  'admin_direct'
from hines.family_members as parent
join hines.family_members as child
  on child.tenant_id = parent.tenant_id
where parent.slug = 'member-johnny-elouise-hines-bythwood'
  and child.slug = 'member-johnny-dinavon-bythwood'
on conflict (tenant_id, parent_member_id, child_member_id, relation_type) do nothing;

-- 17. Education record: Dinavon Bythwood — University of Miami
insert into hines.member_education_records (
  tenant_id,
  branch_id,
  member_id,
  member_name,
  credential_summary,
  raw_text,
  sort_order,
  source
)
select
  m.tenant_id,
  m.branch_id,
  m.id,
  m.display_name,
  'University of Miami',
  'Dinavon Bythwood  University of Miami',
  coalesce(
    (select max(e.sort_order) from hines.member_education_records e where e.branch_id = m.branch_id),
    0
  ) + 8,
  'admin_direct'
from hines.family_members m
where m.slug = 'member-johnny-dinavon-bythwood'
on conflict do nothing;
