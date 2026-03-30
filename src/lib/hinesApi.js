import { supabase } from './supabase';

const TENANT_SLUG = 'hines';

export async function fetchTenant() {
  return supabase.from('tenants').select('id, slug, display_name').eq('slug', TENANT_SLUG).maybeSingle();
}

export async function fetchBranchDirectory() {
  return supabase
    .from('hines_branch_directory')
    .select(
      'tenant_slug, tenant_id, branch_id, branch_slug, branch_display_name, tab_label, tree_number, sort_order, founder_member_id, founder_name, founder_dates_label, founder_biography, member_count, education_count',
    )
    .eq('tenant_slug', TENANT_SLUG)
    .order('tree_number', { ascending: true });
}

export async function fetchMemberDirectory() {
  return supabase
    .from('hines_member_directory')
    .select(
      'tenant_slug, tenant_id, member_id, branch_id, branch_slug, display_name, dates_label, is_branch_founder, generation_level, relation_to_root, parent_member_id, co_parent_label',
    )
    .eq('tenant_slug', TENANT_SLUG);
}

export async function fetchEducationFeed() {
  return supabase
    .from('hines_education_feed')
    .select(
      'tenant_slug, tenant_id, id, branch_id, branch_slug, branch_display_name, member_id, member_name, credential_summary, graduation_year, raw_text, sort_order',
    )
    .eq('tenant_slug', TENANT_SLUG)
    .order('sort_order', { ascending: true });
}

export async function submitFamilyUpdateRequest(payload) {
  return supabase.rpc('hines_submit_update_request', {
    target_tenant_slug: TENANT_SLUG,
    ...payload,
  });
}

export async function checkCurrentUserAdmin() {
  return supabase.rpc('hines_is_current_user_admin', {
    target_tenant_slug: TENANT_SLUG,
  });
}

export async function listFamilyUpdateRequests() {
  return supabase.rpc('hines_list_update_requests', {
    target_tenant_slug: TENANT_SLUG,
  });
}

export async function reviewFamilyUpdateRequest(targetRequestId, nextStatus, adminNote) {
  return supabase.rpc('hines_review_update_request', {
    target_request_id: targetRequestId,
    next_status: nextStatus,
    admin_note: adminNote,
  });
}

export async function applyFamilyUpdateRequest(targetRequestId, adminNote) {
  return supabase.rpc('hines_apply_update_request', {
    target_request_id: targetRequestId,
    admin_note: adminNote,
  });
}
