function splitNames(text) {
  return text
    .split('·')
    .map((name) => name.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function branchSlugFromEducationLabel(label) {
  const branchMap = new Map([
    ['Theodore Ball Branch', 'theodore'],
    ['Julian H. Hines Branch', 'julian'],
    ['Abbie Hines Clanton Branch', 'abbie'],
    ['Annie Hines Levant Branch', 'annie'],
    ['James E. Hines Branch', 'james'],
    ['Doyle L. Hines Branch', 'doyle'],
    ['Esther Hines Simmons Branch', 'esther'],
    ['Pompey H. Hines Branch', 'pompeyh'],
    ['Johnny Hines Branch', 'johnny'],
  ]);

  return branchMap.get(label) ?? slugify(label.replace(/\s+branch$/i, ''));
}

function parseEducationItem(item) {
  const [memberName, credentialSummary] = item.split(/\s{2,}/);
  const yearMatch = credentialSummary?.match(/\b(18|19|20)\d{2}\b/);

  return {
    memberName: memberName?.trim() ?? item.trim(),
    credentialSummary: credentialSummary?.trim() ?? item,
    graduationYear: yearMatch ? Number(yearMatch[0]) : null,
  };
}

function normalizePersonName(value) {
  return String(value)
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function educationKey(record) {
  return [
    record.branchSlug ?? '',
    normalizePersonName(record.memberName ?? ''),
    String(record.credentialSummary ?? '').trim().toLowerCase(),
  ].join('::');
}

function memberKey(member) {
  return [
    member.branchSlug ?? '',
    normalizePersonName(member.displayName ?? ''),
  ].join('::');
}

const FALLBACK_PARENT_OVERRIDES = {
  johnny: {
    'imani evans': 'cedric evans',
    'jc evans': 'cedric evans',
    'kia evans': 'farrell evans',
    'savannah evans': 'farrell evans',
    'farrell ej evans jr': 'farrell evans',
    'fredrick ricky evans': 'farrell evans',
    'trishan evans': 'farrell evans',
    'tristen evans': 'farrell evans',
    'dyasia bythwood': 'danelle bythwood',
    'danyla bythwood': 'danelle bythwood',
    'delieia bythwood': 'danelle bythwood',
  },
};

const FALLBACK_COPARENT_OVERRIDES = {
  johnny: {
    'imani evans': 'Cedric + Nia Evans',
    'jc evans': 'Cedric + Nia Evans',
    'savannah evans': 'Farrell + Heather',
    'farrell ej evans jr': 'Farrell + Heather',
  },
};

export function buildFallbackHubData(content) {
  const branchNarratives = new Map(
    content.familyTree.branches.map((branch) => [
      branch.id,
      {
        biography: branch.paragraphs,
        quote: branch.quote ?? null,
        quoteAttribution: branch.quote ? branch.quote.split('"').pop()?.trim() ?? null : null,
      },
    ]),
  );

  const members = [];
  const descendantsCountBySlug = new Map();
  const memberIdsByBranchAndName = new Map();

  const registerMember = (branchSlug, memberName, memberId) => {
    const key = `${branchSlug}:${normalizePersonName(memberName)}`;
    memberIdsByBranchAndName.set(key, memberId);
  };

  content.familyTree.branches.forEach((branch) => {
    const branchId = `fallback-branch-${branch.id}`;
    const member = {
      id: `fallback-founder-${branch.id}`,
      branchId,
      branchSlug: branch.id,
      displayName: branch.name,
      datesLabel: branch.dates,
      isBranchFounder: true,
      generationLevel: 1,
      relationToRoot: 'child',
      parentMemberId: null,
    };

    members.push(member);
    registerMember(branch.id, member.displayName, member.id);
  });

  content.descendants.branches.forEach((branch) => {
    const branchSlug = branch.id.replace(/^d-/, '');
    const branchId = `fallback-branch-${branchSlug}`;
    const founderId = `fallback-founder-${branchSlug}`;
    let runningCount = 0;

    // Track the last group of each type so we can assign parentMemberId
    let lastBranchHeadIds = [founderId];
    let lastChildIds = [];

    branch.groups.forEach((group, groupIndex) => {
      const generationLevel = group.type === 'branch-head' ? 2 : group.type === 'child' ? 3 : 4;
      const currentIds = [];

      splitNames(group.text).forEach((name, nameIndex) => {
        runningCount += 1;
        const id = `fallback-member-${branchSlug}-${groupIndex + 1}-${nameIndex + 1}`;
        currentIds.push(id);

        // Assign parent: branch-heads are children of founder,
        // child entries are children of the last branch-head,
        // grandchild entries are children of the last child group's first member
        let parentMemberId = null;
        const normalizedName = normalizePersonName(name);
        const overrideParentName = FALLBACK_PARENT_OVERRIDES[branchSlug]?.[normalizedName];
        if (group.type === 'branch-head') {
          parentMemberId = founderId;
        } else if (overrideParentName) {
          parentMemberId = memberIdsByBranchAndName.get(`${branchSlug}:${overrideParentName}`) ?? null;
        } else if (group.type === 'child') {
          parentMemberId = lastBranchHeadIds[0] ?? founderId;
        } else if (group.type === 'grandchild') {
          parentMemberId = lastChildIds[0] ?? null;
        }

        members.push({
          id,
          branchId,
          branchSlug,
          displayName: name,
          datesLabel: null,
          isBranchFounder: false,
          generationLevel,
          relationToRoot: 'descendant',
          parentMemberId,
          coParentLabel: FALLBACK_COPARENT_OVERRIDES[branchSlug]?.[normalizedName] ?? null,
        });
        registerMember(branchSlug, name, id);
      });

      if (group.type === 'branch-head') lastBranchHeadIds = currentIds;
      if (group.type === 'child') lastChildIds = currentIds;
    });

    descendantsCountBySlug.set(branchSlug, runningCount + 1);
  });

  const education = [];
  const educationCountBySlug = new Map();

  content.education.degrees.forEach((branch, branchIndex) => {
    const branchSlug = branchSlugFromEducationLabel(branch.branch);
    educationCountBySlug.set(branchSlug, branch.items.length);

    branch.items.forEach((item, itemIndex) => {
      const parsed = parseEducationItem(item);
      education.push({
        id: `fallback-education-${branchIndex + 1}-${itemIndex + 1}`,
        memberId: memberIdsByBranchAndName.get(`${branchSlug}:${normalizePersonName(parsed.memberName)}`) ?? null,
        branchSlug,
        branchLabel: branch.branch.replace(/\s+Branch$/i, ''),
        memberName: parsed.memberName,
        credentialSummary: parsed.credentialSummary,
        graduationYear: parsed.graduationYear,
      });
    });
  });

  const branches = content.familyTree.branches.map((branch) => {
    const narrative = branchNarratives.get(branch.id);

    return {
      id: `fallback-branch-${branch.id}`,
      slug: branch.id,
      displayName: branch.name,
      founderName: branch.name,
      datesLabel: branch.dates,
      treeNumber: Number(branch.treeNumber.match(/(\d+)/)?.[1] ?? 0),
      biography: narrative?.biography ?? [],
      quote: branch.quote ?? null,
      memberCount: descendantsCountBySlug.get(branch.id) ?? 1,
      educationCount: educationCountBySlug.get(branch.id) ?? 0,
    };
  });

  return {
    branches,
    members,
    education,
    summaryStats: {
      branches: branches.length,
      members: members.length,
      education: education.length,
    },
  };
}

export function mapRemoteHubData(branchRows, memberRows, educationRows) {
  const branches = [...branchRows]
    .sort((left, right) => (left.tree_number ?? 999) - (right.tree_number ?? 999))
    .map((branch) => ({
      id: branch.branch_id,
      slug: branch.branch_slug,
      displayName: branch.branch_display_name,
      founderName: branch.founder_name ?? branch.branch_display_name,
      datesLabel: branch.founder_dates_label ?? null,
      treeNumber: branch.tree_number ?? 0,
      biography: Array.isArray(branch.founder_biography) ? branch.founder_biography : [],
      quote: null,
      memberCount: branch.member_count ?? 0,
      educationCount: branch.education_count ?? 0,
    }));

  const members = memberRows.map((member) => ({
    id: member.member_id,
    branchId: member.branch_id,
    branchSlug: member.branch_slug,
    displayName: member.display_name,
    datesLabel: member.dates_label,
    isBranchFounder: member.is_branch_founder,
    generationLevel: member.generation_level,
    relationToRoot: member.relation_to_root,
    parentMemberId: member.parent_member_id ?? null,
    coParentLabel: member.co_parent_label ?? null,
  }));

  const education = educationRows.map((record) => ({
    id: record.id,
    branchId: record.branch_id,
    branchSlug: record.branch_slug,
    branchLabel: record.branch_display_name,
    memberId: record.member_id,
    memberName: record.member_name,
    credentialSummary: record.credential_summary,
    graduationYear: record.graduation_year,
    rawText: record.raw_text,
    sortOrder: record.sort_order,
  }));

  return {
    branches,
    members,
    education,
    summaryStats: {
      branches: branches.length,
      members: members.length,
      education: education.length,
    },
  };
}

export function mergeHubDataWithFallback(remoteHubData, fallbackHubData) {
  const mergedBranchesBySlug = new Map();
  const fallbackBranchBySlug = new Map(fallbackHubData.branches.map((branch) => [branch.slug, branch]));

  remoteHubData.branches.forEach((branch) => {
    const fallbackBranch = fallbackBranchBySlug.get(branch.slug);

    mergedBranchesBySlug.set(branch.slug, {
      ...(fallbackBranch ?? {}),
      ...branch,
      biography: branch.biography?.length ? branch.biography : (fallbackBranch?.biography ?? []),
      quote: branch.quote ?? fallbackBranch?.quote ?? null,
    });
  });

  fallbackHubData.branches.forEach((branch) => {
    if (!mergedBranchesBySlug.has(branch.slug)) {
      mergedBranchesBySlug.set(branch.slug, branch);
    }
  });

  const canonicalBranchIdBySlug = new Map(
    [...mergedBranchesBySlug.values()].map((branch) => [branch.slug, branch.id]),
  );

  const mergedMembers = remoteHubData.members.map((member) => ({
    ...member,
    branchId: canonicalBranchIdBySlug.get(member.branchSlug) ?? member.branchId,
  }));
  const seenMembers = new Set(remoteHubData.members.map(memberKey));

  fallbackHubData.members.forEach((member) => {
    const key = memberKey(member);

    if (!seenMembers.has(key)) {
      mergedMembers.push({
        ...member,
        branchId: canonicalBranchIdBySlug.get(member.branchSlug) ?? member.branchId,
      });
      seenMembers.add(key);
    }
  });

  const mergedEducation = remoteHubData.education.map((record) => ({
    ...record,
    branchId: canonicalBranchIdBySlug.get(record.branchSlug) ?? record.branchId,
  }));
  const seenEducation = new Set(remoteHubData.education.map(educationKey));

  fallbackHubData.education.forEach((record) => {
    const key = educationKey(record);

    if (!seenEducation.has(key)) {
      mergedEducation.push({
        ...record,
        branchId: canonicalBranchIdBySlug.get(record.branchSlug) ?? record.branchId,
      });
      seenEducation.add(key);
    }
  });

  const mergedBranches = [...mergedBranchesBySlug.values()]
    .map((branch) => {
      const memberCount = mergedMembers.filter((member) => member.branchSlug === branch.slug).length;
      const educationCount = mergedEducation.filter((record) => record.branchSlug === branch.slug).length;

      return {
        ...branch,
        memberCount,
        educationCount,
      };
    })
    .sort((left, right) => (left.treeNumber ?? 999) - (right.treeNumber ?? 999));

  return {
    branches: mergedBranches,
    members: mergedMembers,
    education: mergedEducation,
    summaryStats: {
      branches: mergedBranches.length,
      members: mergedMembers.length,
      education: mergedEducation.length,
    },
  };
}
