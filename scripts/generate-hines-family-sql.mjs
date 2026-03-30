import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteContent } from '../src/content.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '../supabase/sql/hines-family-schema.sql');

const tenantSlug = 'hines';
const tenantName = 'pompey-hines-foundation';
const tenantDisplayName = 'The Pompey B. Hines Foundation';

function sqlString(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function parseTreeNumber(treeNumber) {
  const match = treeNumber.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function splitDatesLabel(datesLabel) {
  const [birthPart, deathPart] = datesLabel.split('·').map((part) => part.trim());

  return {
    birthLabel: birthPart?.replace(/^Born\s+/i, '') ?? null,
    deathLabel: deathPart?.replace(/^Died\s+/i, '') ?? null,
  };
}

function parseQuote(rawQuote) {
  if (!rawQuote) {
    return { quoteText: null, quoteAttribution: null };
  }

  const trimmed = rawQuote.trim();
  const lastQuoteIndex = trimmed.lastIndexOf('"');

  if (trimmed.startsWith('"') && lastQuoteIndex > 0) {
    return {
      quoteText: trimmed.slice(1, lastQuoteIndex).trim(),
      quoteAttribution: trimmed.slice(lastQuoteIndex + 1).trim() || null,
    };
  }

  return { quoteText: trimmed, quoteAttribution: null };
}

function educationBranchToSlug(branchName) {
  const branchMap = new Map([
    ['Theodore Ball Branch', 'theodore'],
    ['Julian H. Hines Branch', 'julian'],
    ['Abbie Hines Clanton Branch', 'abbie'],
    ['Annie Hines Levant Branch', 'annie'],
    ['James E. Hines Branch', 'james'],
    ['Doyle L. Hines Branch', 'doyle'],
    ['Esther Hines Simmons Branch', 'esther'],
    ['Pompey H. Hines Branch', 'pompeyh'],
  ]);

  return branchMap.get(branchName) ?? slugify(branchName.replace(/\s+branch$/i, ''));
}

function parseEducationItem(item) {
  const [namePart, credentialPart] = item.split(/\s{2,}/);
  const graduationYearMatch = credentialPart?.match(/\b(18|19|20)\d{2}\b/);

  return {
    memberName: namePart?.trim() ?? item.trim(),
    credentialSummary: credentialPart?.trim() ?? null,
    graduationYear: graduationYearMatch ? Number(graduationYearMatch[0]) : null,
  };
}

const branches = siteContent.familyTree.branches.map((branch) => {
  const { quoteText, quoteAttribution } = parseQuote(branch.quote);
  const { birthLabel, deathLabel } = splitDatesLabel(branch.dates);

  return {
    slug: branch.id,
    tabLabel: branch.tabLabel,
    displayName: branch.name,
    treeNumber: parseTreeNumber(branch.treeNumber),
    founderSlug: `member-${branch.id}`,
    founderDisplayName: branch.name,
    biography: branch.paragraphs,
    quoteText,
    quoteAttribution,
    datesLabel: branch.dates,
    birthLabel,
    deathLabel,
  };
});

const rootMember = {
  slug: 'member-pompey-b-hines',
  fullName: 'Pompey B. Hines',
  displayName: 'Pompey B. Hines',
  relationToRoot: 'root_ancestor',
  generationLevel: 0,
  birthLabel: 'Aug. 16, 1845',
  deathLabel: 'Jul. 5, 1919',
  datesLabel: 'Born Aug. 16, 1845 · Died Jul. 5, 1919',
  biography: siteContent.legacy.paragraphs,
  quoteText: siteContent.hero.quote,
  quoteAttribution: null,
  branchSlug: null,
  isBranchFounder: false,
  isLiving: false,
};

const memberMap = new Map();
const nodeRows = [];
const relationshipRows = [];
const educationRows = [];

function ensureMember({
  slug,
  fullName,
  displayName,
  branchSlug = null,
  relationToRoot = 'descendant',
  generationLevel = null,
  birthLabel = null,
  deathLabel = null,
  datesLabel = null,
  biography = [],
  quoteText = null,
  quoteAttribution = null,
  isBranchFounder = false,
  isLiving = null,
  metadata = {},
}) {
  const existing = memberMap.get(slug);

  if (existing) {
    existing.fullName ||= fullName;
    existing.displayName ||= displayName;
    existing.branchSlug ||= branchSlug;
    existing.relationToRoot ||= relationToRoot;
    existing.generationLevel ??= generationLevel;
    existing.birthLabel ||= birthLabel;
    existing.deathLabel ||= deathLabel;
    existing.datesLabel ||= datesLabel;
    existing.quoteText ||= quoteText;
    existing.quoteAttribution ||= quoteAttribution;
    existing.isBranchFounder = existing.isBranchFounder || isBranchFounder;
    existing.isLiving ??= isLiving;
    existing.biography = existing.biography.length ? existing.biography : biography;
    existing.metadata = { ...existing.metadata, ...metadata };
    return existing;
  }

  const member = {
    slug,
    fullName,
    displayName,
    branchSlug,
    relationToRoot,
    generationLevel,
    birthLabel,
    deathLabel,
    datesLabel,
    biography,
    quoteText,
    quoteAttribution,
    isBranchFounder,
    isLiving,
    metadata,
  };

  memberMap.set(slug, member);
  return member;
}

ensureMember(rootMember);

for (const branch of branches) {
  ensureMember({
    slug: branch.founderSlug,
    fullName: branch.founderDisplayName,
    displayName: branch.founderDisplayName,
    branchSlug: branch.slug,
    relationToRoot: 'child',
    generationLevel: 1,
    birthLabel: branch.birthLabel,
    deathLabel: branch.deathLabel,
    datesLabel: branch.datesLabel,
    biography: branch.biography,
    quoteText: branch.quoteText,
    quoteAttribution: branch.quoteAttribution,
    isBranchFounder: true,
    isLiving: false,
    metadata: { source: 'familyTree' },
  });

  relationshipRows.push({
    parentSlug: rootMember.slug,
    childSlug: branch.founderSlug,
    branchSlug: branch.slug,
    relationType: 'parent_child',
    isVerified: true,
    source: 'published-family-tree',
  });
}

for (const descendantBranch of siteContent.descendants.branches) {
  const branchSlug = descendantBranch.id.replace(/^d-/, '');
  const branch = branches.find((item) => item.slug === branchSlug);

  if (!branch) {
    continue;
  }

  const levelState = {
    1: branch.founderSlug,
    2: null,
    3: null,
  };

  const levelNumberByType = {
    'branch-head': 1,
    child: 2,
    grandchild: 3,
  };

  descendantBranch.groups.forEach((group, groupIndex) => {
    const levelNumber = levelNumberByType[group.type] ?? 1;
    const names = group.text.split('·').map((name) => name.trim()).filter(Boolean);

    names.forEach((name, nameIndex) => {
      const memberSlug = `member-${branchSlug}-${slugify(name)}`;
      const nodeSlug = `node-${branchSlug}-${groupIndex + 1}-${nameIndex + 1}-${slugify(name)}`;
      const generationLevel = levelNumber + 1;
      const parentMemberSlug =
        levelNumber === 1
          ? branch.founderSlug
          : levelState[levelNumber - 1];

      ensureMember({
        slug: memberSlug,
        fullName: name,
        displayName: name,
        branchSlug,
        relationToRoot: 'descendant',
        generationLevel,
        biography: [],
        metadata: {
          source: 'descendants',
          parsed_from_display_tree: true,
        },
      });

      nodeRows.push({
        branchSlug,
        nodeSlug,
        parentNodeSlug:
          levelNumber === 1
            ? null
            : levelState[levelNumber - 1]
              ? `node-ref-${levelState[levelNumber - 1]}`
              : null,
        memberSlug,
        nodeKind: group.type,
        label: name,
        sortOrder: groupIndex * 100 + nameIndex + 1,
      });

      if (parentMemberSlug) {
        relationshipRows.push({
          parentSlug: parentMemberSlug,
          childSlug: memberSlug,
          branchSlug,
          relationType: 'parent_child',
          isVerified: levelNumber === 1,
          source: 'published-descendant-list',
        });
      }

      levelState[levelNumber] = memberSlug;

      if (levelNumber < 3) {
        levelState[3] = null;
      }
      if (levelNumber < 2) {
        levelState[2] = null;
      }

      nodeRows[nodeRows.length - 1].parentNodeSlug =
        levelNumber === 1
          ? null
          : nodeRows
              .filter((node) => node.memberSlug === levelState[levelNumber - 1])
              .at(-1)?.nodeSlug ?? null;
    });
  });
}

for (const branchEducation of siteContent.education.degrees) {
  const branchSlug = educationBranchToSlug(branchEducation.branch);

  branchEducation.items.forEach((item, index) => {
    const parsed = parseEducationItem(item);
    const memberSlug = `member-${branchSlug}-${slugify(parsed.memberName)}`;

    ensureMember({
      slug: memberSlug,
      fullName: parsed.memberName,
      displayName: parsed.memberName,
      branchSlug,
      relationToRoot: 'descendant',
      biography: [],
      metadata: {
        source: 'education',
      },
    });

    educationRows.push({
      branchSlug,
      memberSlug,
      memberName: parsed.memberName,
      credentialSummary: parsed.credentialSummary,
      graduationYear: parsed.graduationYear,
      rawText: item,
      sortOrder: index + 1,
    });
  });
}

const uniqueRelationships = Array.from(
  new Map(
    relationshipRows.map((row) => [
      `${row.branchSlug}|${row.parentSlug}|${row.childSlug}|${row.relationType}`,
      row,
    ]),
  ).values(),
);

const memberRows = Array.from(memberMap.values()).sort((a, b) => a.slug.localeCompare(b.slug));

function memberInsertRow(member) {
  return `(
  (select id from public.tenants where slug = ${sqlString(tenantSlug)}),
  ${sqlString(member.slug)},
  ${member.branchSlug ? `(select id from hines.family_branches where tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)}) and slug = ${sqlString(member.branchSlug)})` : 'null'},
  ${sqlString(member.fullName)},
  ${sqlString(member.displayName)},
  ${sqlString(member.relationToRoot)},
  ${member.generationLevel ?? 'null'},
  ${sqlString(member.birthLabel)},
  ${sqlString(member.deathLabel)},
  ${sqlString(member.datesLabel)},
  ${sqlJson(member.biography)},
  ${sqlString(member.quoteText)},
  ${sqlString(member.quoteAttribution)},
  ${member.isBranchFounder ? 'true' : 'false'},
  ${member.isLiving === null ? 'null' : member.isLiving ? 'true' : 'false'},
  ${sqlJson(member.metadata)}
)`;
}

function branchInsertRow(branch) {
  return `(
  (select id from public.tenants where slug = ${sqlString(tenantSlug)}),
  ${sqlString(branch.slug)},
  ${sqlString(branch.tabLabel)},
  ${sqlString(branch.displayName)},
  ${branch.treeNumber ?? 'null'},
  ${branch.treeNumber ?? 'null'},
  ${sqlJson({ source: 'familyTree' })}
)`;
}

function nodeInsertRow(node) {
  return `(
  (select id from public.tenants where slug = ${sqlString(tenantSlug)}),
  (select id from hines.family_branches where tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)}) and slug = ${sqlString(node.branchSlug)}),
  null,
  (select id from hines.family_members where tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)}) and slug = ${sqlString(node.memberSlug)}),
  ${sqlString(node.nodeSlug)},
  ${sqlString(node.nodeKind)},
  ${sqlString(node.label)},
  ${node.sortOrder},
  ${sqlJson({
    source: 'descendants',
    seed_parent_node_slug: node.parentNodeSlug,
  })}
)`;
}

function relationshipInsertRow(relationship) {
  return `(
  (select id from public.tenants where slug = ${sqlString(tenantSlug)}),
  ${relationship.branchSlug ? `(select id from hines.family_branches where tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)}) and slug = ${sqlString(relationship.branchSlug)})` : 'null'},
  (select id from hines.family_members where tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)}) and slug = ${sqlString(relationship.parentSlug)}),
  (select id from hines.family_members where tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)}) and slug = ${sqlString(relationship.childSlug)}),
  ${sqlString(relationship.relationType)},
  ${relationship.isVerified ? 'true' : 'false'},
  ${sqlString(relationship.source)}
)`;
}

function educationInsertRow(row) {
  return `(
  (select id from public.tenants where slug = ${sqlString(tenantSlug)}),
  (select id from hines.family_branches where tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)}) and slug = ${sqlString(row.branchSlug)}),
  (select id from hines.family_members where tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)}) and slug = ${sqlString(row.memberSlug)}),
  ${sqlString(row.memberName)},
  ${sqlString(row.credentialSummary)},
  ${row.graduationYear ?? 'null'},
  ${sqlString(row.rawText)},
  ${row.sortOrder},
  'published-site'
)`;
}

const sql = `-- Generated from src/content.js by scripts/generate-hines-family-sql.mjs
-- Seed target: tenant slug ${tenantSlug}

create schema if not exists hines;

create or replace function hines.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function hines.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function hines.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_admins
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
  )
  or hines.is_platform_admin();
$$;

create table if not exists hines.family_branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  founder_member_id uuid,
  tab_label text not null,
  display_name text not null,
  tree_number integer,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint family_branches_tenant_slug_key unique (tenant_id, slug)
);

create table if not exists hines.family_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  branch_id uuid references hines.family_branches(id) on delete set null,
  full_name text not null,
  display_name text not null,
  relation_to_root text not null default 'descendant'
    check (relation_to_root = any (array['root_ancestor', 'child', 'descendant', 'spouse'])),
  generation_level integer,
  birth_label text,
  death_label text,
  dates_label text,
  biography jsonb not null default '[]'::jsonb,
  quote_text text,
  quote_attribution text,
  is_branch_founder boolean not null default false,
  is_living boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint family_members_tenant_slug_key unique (tenant_id, slug)
);

alter table hines.family_branches
  drop constraint if exists family_branches_founder_member_id_fkey;

alter table hines.family_branches
  add constraint family_branches_founder_member_id_fkey
  foreign key (founder_member_id) references hines.family_members(id) on delete set null;

create table if not exists hines.member_relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references hines.family_branches(id) on delete set null,
  parent_member_id uuid not null references hines.family_members(id) on delete cascade,
  child_member_id uuid not null references hines.family_members(id) on delete cascade,
  relation_type text not null default 'parent_child'
    check (relation_type = any (array['parent_child', 'spouse', 'guardian', 'sibling'])),
  is_verified boolean not null default false,
  source text,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint member_relationships_unique_edge unique (tenant_id, parent_member_id, child_member_id, relation_type)
);

create table if not exists hines.branch_tree_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references hines.family_branches(id) on delete cascade,
  parent_node_id uuid references hines.branch_tree_nodes(id) on delete cascade,
  member_id uuid references hines.family_members(id) on delete set null,
  node_slug text not null,
  node_kind text not null
    check (node_kind = any (array['branch-head', 'child', 'grandchild', 'location'])),
  label text not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint branch_tree_nodes_tenant_slug_key unique (tenant_id, node_slug)
);

create table if not exists hines.member_education_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references hines.family_branches(id) on delete set null,
  member_id uuid references hines.family_members(id) on delete set null,
  member_name text not null,
  credential_summary text,
  graduation_year integer,
  raw_text text not null,
  sort_order integer not null default 0,
  source text not null default 'family-submission',
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  constraint member_education_records_unique_seed unique (tenant_id, branch_id, member_name, raw_text)
);

create table if not exists hines.member_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references hines.family_branches(id) on delete set null,
  member_id uuid references hines.family_members(id) on delete set null,
  member_name text not null,
  location_label text not null,
  location_type text not null default 'current'
    check (location_type = any (array['current', 'birth', 'death', 'burial', 'historical'])),
  is_current boolean not null default false,
  notes text,
  source text not null default 'family-submission',
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now())
);

create table if not exists hines.family_update_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references hines.family_branches(id) on delete set null,
  member_id uuid references hines.family_members(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  request_type text not null
    check (request_type = any (array['new_member', 'member_edit', 'new_branch', 'education_update', 'location_update', 'relationship_update', 'photo_update'])),
  requester_name text not null,
  requester_email text not null,
  requester_phone text,
  relationship_to_family text,
  subject text not null,
  message text,
  proposed_payload jsonb not null default '{}'::jsonb,
  evidence_urls jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status = any (array['pending', 'under_review', 'approved', 'rejected', 'implemented'])),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  admin_notes text,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now())
);

create index if not exists family_branches_tenant_idx on hines.family_branches (tenant_id, sort_order);
create index if not exists family_members_tenant_branch_idx on hines.family_members (tenant_id, branch_id, generation_level);
create index if not exists member_relationships_tenant_branch_idx on hines.member_relationships (tenant_id, branch_id);
create index if not exists branch_tree_nodes_branch_parent_idx on hines.branch_tree_nodes (branch_id, parent_node_id, sort_order);
create index if not exists member_education_records_branch_idx on hines.member_education_records (branch_id, sort_order);
create index if not exists member_locations_branch_idx on hines.member_locations (branch_id, is_current);
create index if not exists family_update_requests_tenant_status_idx on hines.family_update_requests (tenant_id, status, request_type);

drop trigger if exists touch_family_branches_updated_at on hines.family_branches;
create trigger touch_family_branches_updated_at
before update on hines.family_branches
for each row execute function hines.touch_updated_at();

drop trigger if exists touch_family_members_updated_at on hines.family_members;
create trigger touch_family_members_updated_at
before update on hines.family_members
for each row execute function hines.touch_updated_at();

drop trigger if exists touch_member_relationships_updated_at on hines.member_relationships;
create trigger touch_member_relationships_updated_at
before update on hines.member_relationships
for each row execute function hines.touch_updated_at();

drop trigger if exists touch_branch_tree_nodes_updated_at on hines.branch_tree_nodes;
create trigger touch_branch_tree_nodes_updated_at
before update on hines.branch_tree_nodes
for each row execute function hines.touch_updated_at();

drop trigger if exists touch_member_education_records_updated_at on hines.member_education_records;
create trigger touch_member_education_records_updated_at
before update on hines.member_education_records
for each row execute function hines.touch_updated_at();

drop trigger if exists touch_member_locations_updated_at on hines.member_locations;
create trigger touch_member_locations_updated_at
before update on hines.member_locations
for each row execute function hines.touch_updated_at();

drop trigger if exists touch_family_update_requests_updated_at on hines.family_update_requests;
create trigger touch_family_update_requests_updated_at
before update on hines.family_update_requests
for each row execute function hines.touch_updated_at();

alter table hines.family_branches enable row level security;
alter table hines.family_members enable row level security;
alter table hines.member_relationships enable row level security;
alter table hines.branch_tree_nodes enable row level security;
alter table hines.member_education_records enable row level security;
alter table hines.member_locations enable row level security;
alter table hines.family_update_requests enable row level security;

drop policy if exists family_branches_public_read on hines.family_branches;
create policy family_branches_public_read
on hines.family_branches
for select
using (true);

drop policy if exists family_members_public_read on hines.family_members;
create policy family_members_public_read
on hines.family_members
for select
using (true);

drop policy if exists member_relationships_public_read on hines.member_relationships;
create policy member_relationships_public_read
on hines.member_relationships
for select
using (true);

drop policy if exists branch_tree_nodes_public_read on hines.branch_tree_nodes;
create policy branch_tree_nodes_public_read
on hines.branch_tree_nodes
for select
using (true);

drop policy if exists member_education_records_public_read on hines.member_education_records;
create policy member_education_records_public_read
on hines.member_education_records
for select
using (true);

drop policy if exists member_locations_public_read on hines.member_locations;
create policy member_locations_public_read
on hines.member_locations
for select
using (true);

drop policy if exists family_update_requests_submit_public on hines.family_update_requests;
create policy family_update_requests_submit_public
on hines.family_update_requests
for insert
with check (true);

drop policy if exists family_update_requests_submitter_read on hines.family_update_requests;
create policy family_update_requests_submitter_read
on hines.family_update_requests
for select
using (
  hines.is_tenant_admin(tenant_id)
  or submitted_by = auth.uid()
);

drop policy if exists family_update_requests_admin_manage on hines.family_update_requests;
create policy family_update_requests_admin_manage
on hines.family_update_requests
for update
using (hines.is_tenant_admin(tenant_id))
with check (hines.is_tenant_admin(tenant_id));

drop policy if exists family_branches_admin_write on hines.family_branches;
create policy family_branches_admin_write
on hines.family_branches
for all
using (hines.is_tenant_admin(tenant_id))
with check (hines.is_tenant_admin(tenant_id));

drop policy if exists family_members_admin_write on hines.family_members;
create policy family_members_admin_write
on hines.family_members
for all
using (hines.is_tenant_admin(tenant_id))
with check (hines.is_tenant_admin(tenant_id));

drop policy if exists member_relationships_admin_write on hines.member_relationships;
create policy member_relationships_admin_write
on hines.member_relationships
for all
using (hines.is_tenant_admin(tenant_id))
with check (hines.is_tenant_admin(tenant_id));

drop policy if exists branch_tree_nodes_admin_write on hines.branch_tree_nodes;
create policy branch_tree_nodes_admin_write
on hines.branch_tree_nodes
for all
using (hines.is_tenant_admin(tenant_id))
with check (hines.is_tenant_admin(tenant_id));

drop policy if exists member_education_records_admin_write on hines.member_education_records;
create policy member_education_records_admin_write
on hines.member_education_records
for all
using (hines.is_tenant_admin(tenant_id))
with check (hines.is_tenant_admin(tenant_id));

drop policy if exists member_locations_admin_write on hines.member_locations;
create policy member_locations_admin_write
on hines.member_locations
for all
using (hines.is_tenant_admin(tenant_id))
with check (hines.is_tenant_admin(tenant_id));

insert into public.tenants (
  slug,
  name,
  display_name,
  business_tagline,
  business_summary,
  primary_cta_label
)
values (
  ${sqlString(tenantSlug)},
  ${sqlString(tenantName)},
  ${sqlString(tenantDisplayName)},
  ${sqlString('Legacy, genealogy, and family updates')},
  ${sqlString('A tenant for the Pompey B. Hines family tree, descendant history, education records, and family-submitted update requests.')},
  ${sqlString('Submit a family update')}
)
on conflict (slug) do update
set
  name = excluded.name,
  display_name = excluded.display_name,
  business_tagline = excluded.business_tagline,
  business_summary = excluded.business_summary,
  primary_cta_label = excluded.primary_cta_label,
  updated_at = timezone('utc', now());

insert into hines.family_branches (
  tenant_id,
  slug,
  tab_label,
  display_name,
  tree_number,
  sort_order,
  metadata
)
values
${branches.map(branchInsertRow).join(',\n')}
on conflict (tenant_id, slug) do update
set
  tab_label = excluded.tab_label,
  display_name = excluded.display_name,
  tree_number = excluded.tree_number,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata;

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
${memberRows.map(memberInsertRow).join(',\n')}
on conflict (tenant_id, slug) do update
set
  branch_id = coalesce(excluded.branch_id, hines.family_members.branch_id),
  full_name = excluded.full_name,
  display_name = excluded.display_name,
  relation_to_root = excluded.relation_to_root,
  generation_level = coalesce(excluded.generation_level, hines.family_members.generation_level),
  birth_label = coalesce(excluded.birth_label, hines.family_members.birth_label),
  death_label = coalesce(excluded.death_label, hines.family_members.death_label),
  dates_label = coalesce(excluded.dates_label, hines.family_members.dates_label),
  biography = case
    when jsonb_array_length(excluded.biography) > 0 then excluded.biography
    else hines.family_members.biography
  end,
  quote_text = coalesce(excluded.quote_text, hines.family_members.quote_text),
  quote_attribution = coalesce(excluded.quote_attribution, hines.family_members.quote_attribution),
  is_branch_founder = excluded.is_branch_founder or hines.family_members.is_branch_founder,
  is_living = coalesce(excluded.is_living, hines.family_members.is_living),
  metadata = hines.family_members.metadata || excluded.metadata;

update hines.family_branches as branches
set founder_member_id = members.id
from hines.family_members as members
where branches.tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)})
  and members.tenant_id = branches.tenant_id
  and members.slug = 'member-' || branches.slug;

insert into hines.member_relationships (
  tenant_id,
  branch_id,
  parent_member_id,
  child_member_id,
  relation_type,
  is_verified,
  source
)
values
${uniqueRelationships.map(relationshipInsertRow).join(',\n')}
on conflict (tenant_id, parent_member_id, child_member_id, relation_type) do update
set
  branch_id = coalesce(excluded.branch_id, hines.member_relationships.branch_id),
  is_verified = excluded.is_verified or hines.member_relationships.is_verified,
  source = excluded.source;

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
values
${nodeRows.map(nodeInsertRow).join(',\n')}
on conflict (tenant_id, node_slug) do update
set
  branch_id = excluded.branch_id,
  member_id = excluded.member_id,
  node_kind = excluded.node_kind,
  label = excluded.label,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata;

update hines.branch_tree_nodes as child
set parent_node_id = parent.id
from hines.branch_tree_nodes as parent
where child.tenant_id = (select id from public.tenants where slug = ${sqlString(tenantSlug)})
  and parent.tenant_id = child.tenant_id
  and child.metadata ->> 'seed_parent_node_slug' is not null
  and parent.node_slug = child.metadata ->> 'seed_parent_node_slug';

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
values
${educationRows.map(educationInsertRow).join(',\n')}
on conflict (tenant_id, branch_id, member_name, raw_text) do update
set
  member_id = coalesce(excluded.member_id, hines.member_education_records.member_id),
  credential_summary = excluded.credential_summary,
  graduation_year = coalesce(excluded.graduation_year, hines.member_education_records.graduation_year),
  sort_order = excluded.sort_order,
  source = excluded.source;
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, sql);

console.log(`Wrote ${outputPath}`);
