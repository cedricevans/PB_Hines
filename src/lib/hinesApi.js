import { supabase } from './supabase';

const TENANT_SLUG = 'hines';
const MEMBER_DIRECTORY_BASE_FIELDS =
  'tenant_slug, tenant_id, member_id, branch_id, branch_slug, display_name, dates_label, is_branch_founder, generation_level, relation_to_root';
const MEMBER_DIRECTORY_TREE_FIELDS = `${MEMBER_DIRECTORY_BASE_FIELDS}, parent_member_id, co_parent_label`;
const hinesDb = supabase.schema('hines');

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
  const result = await supabase
    .from('hines_member_directory')
    .select(MEMBER_DIRECTORY_TREE_FIELDS)
    .eq('tenant_slug', TENANT_SLUG);

  if (!result.error) {
    return result;
  }

  const errorMessage = result.error.message ?? '';
  const missingTreeColumns =
    errorMessage.includes('parent_member_id') || errorMessage.includes('co_parent_label');

  if (!missingTreeColumns) {
    return result;
  }

  const fallbackResult = await supabase
    .from('hines_member_directory')
    .select(MEMBER_DIRECTORY_BASE_FIELDS)
    .eq('tenant_slug', TENANT_SLUG);

  if (fallbackResult.error) {
    return fallbackResult;
  }

  return {
    ...fallbackResult,
    data: (fallbackResult.data ?? []).map((member) => ({
      ...member,
      parent_member_id: null,
      co_parent_label: null,
    })),
  };
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

export async function fetchAdminFamilyMembers() {
  return hinesDb
    .from('family_members')
    .select(
      'id, tenant_id, slug, branch_id, full_name, display_name, relation_to_root, generation_level, birth_label, death_label, dates_label, biography, is_branch_founder, is_living, metadata',
    )
    .order('generation_level', { ascending: true, nullsFirst: true })
    .order('display_name', { ascending: true });
}

export async function fetchAdminRelationships() {
  return hinesDb
    .from('member_relationships')
    .select('id, tenant_id, branch_id, parent_member_id, child_member_id, relation_type, is_verified, source')
    .eq('relation_type', 'parent_child');
}

export async function fetchAdminEducationRecords() {
  return hinesDb
    .from('member_education_records')
    .select('id, tenant_id, branch_id, member_id, member_name, credential_summary, graduation_year, raw_text, sort_order, source')
    .order('sort_order', { ascending: true });
}

export async function createAdminFamilyMember(payload) {
  return hinesDb.from('family_members').insert(payload).select('id').single();
}

export async function updateAdminFamilyMember(memberId, payload) {
  return hinesDb.from('family_members').update(payload).eq('id', memberId).select('id').single();
}

export async function deleteAdminFamilyMember(memberId) {
  const educationResult = await hinesDb.from('member_education_records').delete().eq('member_id', memberId);

  if (educationResult.error) {
    return educationResult;
  }

  return hinesDb.from('family_members').delete().eq('id', memberId);
}

export async function replaceAdminParentRelationship({ tenantId, branchId, childMemberId, parentMemberId }) {
  const deleteResult = await hinesDb
    .from('member_relationships')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('child_member_id', childMemberId)
    .eq('relation_type', 'parent_child');

  if (deleteResult.error || !parentMemberId) {
    return deleteResult;
  }

  return hinesDb.from('member_relationships').insert({
    tenant_id: tenantId,
    branch_id: branchId || null,
    parent_member_id: parentMemberId,
    child_member_id: childMemberId,
    relation_type: 'parent_child',
    is_verified: true,
    source: 'admin_console',
  });
}

export async function createAdminEducationRecord(payload) {
  return hinesDb.from('member_education_records').insert(payload).select('id').single();
}

export async function updateAdminEducationRecord(recordId, payload) {
  return hinesDb.from('member_education_records').update(payload).eq('id', recordId).select('id').single();
}

export async function deleteAdminEducationRecord(recordId) {
  return hinesDb.from('member_education_records').delete().eq('id', recordId);
}
