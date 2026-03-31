export const REQUEST_TYPES = [
  { value: 'member_edit', label: 'Correct a member' },
  { value: 'new_member', label: 'Add a family member' },
  { value: 'education_update', label: 'Add a graduation' },
  { value: 'location_update', label: 'Update family location' },
  { value: 'relationship_update', label: 'Fix a relationship' },
  { value: 'new_branch', label: 'Extend a branch' },
  { value: 'photo_update', label: 'Add a photo or document' },
];

export const REQUEST_HINTS = {
  member_edit:
    'Correct names, dates, spellings, founder details, branch placement, or historical notes for an existing person.',
  new_member:
    'Add a relative to an existing branch, including parent links, dates, and enough context to place them correctly.',
  education_update:
    'Share degree, school, graduation year, honors, and which branch or member the achievement belongs to.',
  location_update:
    'Report where a branch or member lives now, including city, state, and any context that matters to the archive.',
  relationship_update:
    'Clarify parent-child, spouse, guardian, or sibling relationships in the family tree.',
  new_branch:
    'Extend the current branch with a missing line, household, or branch-head without rewriting the original seeded archive.',
  photo_update:
    'Submit scans, programs, obituaries, class photos, gravestones, or documents that support an archive update.',
};

export const EMPTY_FORM = {
  requestType: 'member_edit',
  requesterName: '',
  requesterEmail: '',
  requesterPhone: '',
  relationshipToFamily: '',
  branchId: '',
  memberId: '',
  subject: '',
  proposedName: '',
  currentLocation: '',
  educationDetails: '',
  message: '',
  evidenceUrls: '',
};

export const EMPTY_AUTH_FORM = {
  email: 'cedric.evans@gmail.com',
  password: '',
};

export const SUPPORTED_APPLY_TYPES = new Set(['new_member', 'new_branch', 'education_update', 'location_update']);

export const EMPTY_ADMIN_MEMBER_FORM = {
  id: '',
  tenantId: '',
  branchId: '',
  fullName: '',
  displayName: '',
  slug: '',
  relationToRoot: 'descendant',
  generationLevel: '',
  birthLabel: '',
  deathLabel: '',
  datesLabel: '',
  biography: '',
  isBranchFounder: false,
  isLiving: true,
  parentMemberId: '',
  coParentLabel: '',
  metadata: {},
};

export const EMPTY_ADMIN_EDUCATION_FORM = {
  id: '',
  tenantId: '',
  branchId: '',
  memberId: '',
  memberName: '',
  credentialSummary: '',
  graduationYear: '',
  rawText: '',
  sortOrder: '',
};
