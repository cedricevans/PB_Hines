-- Hines admin bootstrap + request review/apply workflow
-- Run this after hines-family-schema.sql

create schema if not exists hines;

create or replace function hines.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(replace(lower(coalesce(input, '')), '&', ' and '), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function hines.promote_existing_user(
  user_email text,
  target_tenant_slug text default 'hines',
  target_role text default 'owner',
  make_platform_admin boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, hines
as $$
declare
  v_user_id uuid;
  v_tenant_id uuid;
begin
  select id
  into v_user_id
  from auth.users
  where lower(email) = lower(user_email)
  order by created_at asc
  limit 1;

  if v_user_id is null then
    raise exception 'No authenticated Supabase user exists for email %', user_email;
  end if;

  select id
  into v_tenant_id
  from public.tenants
  where slug = target_tenant_slug;

  if v_tenant_id is null then
    raise exception 'Tenant with slug % was not found. Run hines-family-schema.sql first.', target_tenant_slug;
  end if;

  if make_platform_admin then
    insert into public.admin_users (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;
  end if;

  insert into public.tenant_admins (tenant_id, user_id, role, email)
  select v_tenant_id, v_user_id, target_role, user_email
  where not exists (
    select 1
    from public.tenant_admins
    where tenant_id = v_tenant_id
      and user_id = v_user_id
  );

  return v_user_id;
end;
$$;

create or replace function hines.review_family_update_request(
  target_request_id uuid,
  next_status text,
  admin_note text default null
)
returns hines.family_update_requests
language plpgsql
security definer
set search_path = public, auth, hines
as $$
declare
  v_request hines.family_update_requests%rowtype;
begin
  select *
  into v_request
  from hines.family_update_requests
  where id = target_request_id;

  if v_request.id is null then
    raise exception 'Family update request % was not found.', target_request_id;
  end if;

  if next_status not in ('pending', 'under_review', 'approved', 'rejected', 'implemented') then
    raise exception 'Unsupported status %', next_status;
  end if;

  if not hines.is_tenant_admin(v_request.tenant_id) then
    raise exception 'You are not a tenant admin for this family archive.';
  end if;

  update hines.family_update_requests
  set
    status = next_status,
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    admin_notes = concat_ws(E'\n', nullif(admin_notes, ''), nullif(admin_note, ''))
  where id = target_request_id
  returning *
  into v_request;

  return v_request;
end;
$$;

create or replace function hines.apply_family_update_request(
  target_request_id uuid,
  admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, hines
as $$
declare
  v_request hines.family_update_requests%rowtype;
  v_payload jsonb;
  v_branch_id uuid;
  v_member_id uuid;
  v_created_member_id uuid;
  v_created_node_id uuid;
  v_created_location_id uuid;
  v_created_education_id uuid;
  v_anchor_node_id uuid;
  v_member_name text;
  v_branch_slug text;
  v_subject text;
  v_message text;
  v_sort_order integer;
  v_node_slug text;
  v_result jsonb;
begin
  select *
  into v_request
  from hines.family_update_requests
  where id = target_request_id;

  if v_request.id is null then
    raise exception 'Family update request % was not found.', target_request_id;
  end if;

  if not hines.is_tenant_admin(v_request.tenant_id) then
    raise exception 'You are not a tenant admin for this family archive.';
  end if;

  if v_request.status = 'rejected' then
    raise exception 'Rejected requests cannot be applied.';
  end if;

  v_payload := coalesce(v_request.proposed_payload, '{}'::jsonb);
  v_branch_id := v_request.branch_id;
  v_member_id := v_request.member_id;
  v_subject := coalesce(nullif(v_request.subject, ''), 'Family update');
  v_message := coalesce(nullif(v_request.message, ''), v_subject);
  v_member_name := coalesce(
    nullif(v_payload ->> 'proposed_name', ''),
    nullif(v_payload ->> 'linked_member_name', ''),
    nullif(v_subject, ''),
    'Unnamed family member'
  );
  v_branch_slug := nullif(v_payload ->> 'branch_slug', '');

  if v_branch_id is null and v_branch_slug is not null then
    select id
    into v_branch_id
    from hines.family_branches
    where tenant_id = v_request.tenant_id
      and slug = v_branch_slug
    limit 1;
  end if;

  if v_request.request_type in ('new_member', 'new_branch', 'education_update', 'location_update') and v_branch_id is null then
    raise exception 'A branch is required before this request can be applied.';
  end if;

  if v_request.request_type = 'new_member' then
    insert into hines.family_members (
      tenant_id,
      slug,
      branch_id,
      full_name,
      display_name,
      relation_to_root,
      generation_level,
      biography,
      metadata
    )
    values (
      v_request.tenant_id,
      'member-' || substring(target_request_id::text from 1 for 8) || '-' || hines.slugify(v_member_name),
      v_branch_id,
      v_member_name,
      v_member_name,
      'descendant',
      (
        select coalesce(generation_level, 1) + 1
        from hines.family_members
        where id = v_member_id
      ),
      jsonb_build_array(v_message),
      jsonb_build_object(
        'source_request_id', target_request_id,
        'created_from_request', true
      )
    )
    on conflict (tenant_id, slug) do update
    set
      display_name = excluded.display_name,
      biography = excluded.biography,
      metadata = hines.family_members.metadata || excluded.metadata
    returning id into v_created_member_id;

    if v_member_id is not null then
      insert into hines.member_relationships (
        tenant_id,
        branch_id,
        parent_member_id,
        child_member_id,
        relation_type,
        is_verified,
        source
      )
      values (
        v_request.tenant_id,
        v_branch_id,
        v_member_id,
        v_created_member_id,
        'parent_child',
        false,
        'family_update_request'
      )
      on conflict (tenant_id, parent_member_id, child_member_id, relation_type) do nothing;
    end if;

    select id
    into v_anchor_node_id
    from hines.branch_tree_nodes
    where tenant_id = v_request.tenant_id
      and member_id = v_member_id
    order by sort_order desc
    limit 1;

    select coalesce(max(sort_order), 0) + 1
    into v_sort_order
    from hines.branch_tree_nodes
    where tenant_id = v_request.tenant_id
      and branch_id = v_branch_id;

    v_node_slug := 'node-' || substring(target_request_id::text from 1 for 8) || '-' || hines.slugify(v_member_name);

    insert into hines.branch_tree_nodes (
      tenant_id,
      branch_id,
      parent_node_id,
      member_id,
      node_slug,
      node_kind,
      label,
      sort_order,
      metadata
    )
    values (
      v_request.tenant_id,
      v_branch_id,
      v_anchor_node_id,
      v_created_member_id,
      v_node_slug,
      case when v_anchor_node_id is null then 'branch-head' else 'child' end,
      v_member_name,
      v_sort_order,
      jsonb_build_object(
        'source_request_id', target_request_id,
        'created_from_request', true
      )
    )
    on conflict (tenant_id, node_slug) do update
    set
      member_id = excluded.member_id,
      label = excluded.label,
      metadata = hines.branch_tree_nodes.metadata || excluded.metadata
    returning id into v_created_node_id;

    v_result := jsonb_build_object(
      'action', 'new_member_applied',
      'member_id', v_created_member_id,
      'node_id', v_created_node_id
    );
  elsif v_request.request_type = 'new_branch' then
    select id
    into v_anchor_node_id
    from hines.branch_tree_nodes
    where tenant_id = v_request.tenant_id
      and member_id = v_member_id
    order by sort_order desc
    limit 1;

    select coalesce(max(sort_order), 0) + 1
    into v_sort_order
    from hines.branch_tree_nodes
    where tenant_id = v_request.tenant_id
      and branch_id = v_branch_id;

    v_node_slug := 'node-branch-extension-' || substring(target_request_id::text from 1 for 8) || '-' || hines.slugify(v_member_name);

    insert into hines.branch_tree_nodes (
      tenant_id,
      branch_id,
      parent_node_id,
      member_id,
      node_slug,
      node_kind,
      label,
      sort_order,
      metadata
    )
    values (
      v_request.tenant_id,
      v_branch_id,
      v_anchor_node_id,
      null,
      v_node_slug,
      'branch-head',
      v_member_name,
      v_sort_order,
      jsonb_build_object(
        'source_request_id', target_request_id,
        'created_from_request', true,
        'branch_extension', true
      )
    )
    on conflict (tenant_id, node_slug) do update
    set
      label = excluded.label,
      metadata = hines.branch_tree_nodes.metadata || excluded.metadata
    returning id into v_created_node_id;

    v_result := jsonb_build_object(
      'action', 'branch_extension_applied',
      'node_id', v_created_node_id
    );
  elsif v_request.request_type = 'education_update' then
    select coalesce(max(sort_order), 0) + 1
    into v_sort_order
    from hines.member_education_records
    where tenant_id = v_request.tenant_id
      and branch_id = v_branch_id;

    insert into hines.member_education_records (
      tenant_id,
      branch_id,
      member_id,
      member_name,
      credential_summary,
      graduation_year,
      raw_text,
      sort_order,
      source
    )
    values (
      v_request.tenant_id,
      v_branch_id,
      v_member_id,
      coalesce(nullif(v_payload ->> 'linked_member_name', ''), v_member_name),
      coalesce(nullif(v_payload ->> 'education_details', ''), v_message),
      nullif(v_payload ->> 'graduation_year', '')::integer,
      concat_ws(' - ',
        coalesce(nullif(v_payload ->> 'linked_member_name', ''), v_member_name),
        coalesce(nullif(v_payload ->> 'education_details', ''), v_message)
      ),
      v_sort_order,
      'family_update_request'
    )
    returning id into v_created_education_id;

    v_result := jsonb_build_object(
      'action', 'education_update_applied',
      'education_record_id', v_created_education_id
    );
  elsif v_request.request_type = 'location_update' then
    insert into hines.member_locations (
      tenant_id,
      branch_id,
      member_id,
      member_name,
      location_label,
      location_type,
      is_current,
      notes,
      source
    )
    values (
      v_request.tenant_id,
      v_branch_id,
      v_member_id,
      coalesce(nullif(v_payload ->> 'linked_member_name', ''), v_member_name),
      coalesce(nullif(v_payload ->> 'current_location', ''), v_message),
      'current',
      true,
      v_message,
      'family_update_request'
    )
    returning id into v_created_location_id;

    v_result := jsonb_build_object(
      'action', 'location_update_applied',
      'location_id', v_created_location_id
    );
  else
    raise exception
      'Request type % requires manual review. Use hines.review_family_update_request(...) to mark it approved or rejected.',
      v_request.request_type;
  end if;

  update hines.family_update_requests
  set
    status = 'implemented',
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    admin_notes = concat_ws(
      E'\n',
      nullif(admin_notes, ''),
      nullif(admin_note, ''),
      'Applied automatically on ' || to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS TZ')
    ),
    proposed_payload = proposed_payload || jsonb_build_object(
      'applied_result', v_result
    )
  where id = target_request_id;

  return jsonb_build_object(
    'request_id', target_request_id,
    'status', 'implemented',
    'result', v_result
  );
end;
$$;

grant execute on function hines.review_family_update_request(uuid, text, text) to authenticated;
grant execute on function hines.apply_family_update_request(uuid, text) to authenticated;

-- Bootstrap Cedric as platform admin + tenant owner.
select hines.promote_existing_user('cedric.evans@gmail.com', 'hines', 'owner', true);

-- Example review flow:
-- select hines.review_family_update_request('<request-uuid>', 'under_review', 'Checking census notes and family documents.');
-- select hines.apply_family_update_request('<request-uuid>', 'Applied into the live branch records.');
-- select hines.review_family_update_request('<request-uuid>', 'approved', 'Approved, but this one needs a manual content edit.');
